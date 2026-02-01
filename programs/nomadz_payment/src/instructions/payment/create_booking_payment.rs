use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use solana_program::pubkey;

use crate::{
    errors::CreateBookingPaymentErrorCode,
    state::{
        booking::{BookingPayment, BookingPaymentStatus},
        config::config::Config,
    },
};

pub const MAGICBLOCK_DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

#[inline(always)]
pub fn is_delegated(ai: &AccountInfo) -> bool {
    ai.owner == &MAGICBLOCK_DELEGATION_PROGRAM_ID
}

/// stable 32-byte seed from (hotel_id, user_id)
pub fn booking_seed(hotel_id: &str, user_id: &str) -> [u8; 32] {
    use anchor_lang::solana_program::hash::hashv;
    hashv(&[b"booking", hotel_id.as_bytes(), b":", user_id.as_bytes()]).to_bytes()
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct CreateBookingPaymentArgs {
    pub hotel_id: String,
    pub user_id: String,
    pub token_amount: u64,
}

pub fn init_booking_payment_handler(
    ctx: Context<InitBookingPayment>,
    args: Box<CreateBookingPaymentArgs>,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let CreateBookingPaymentArgs {
        token_amount,
        user_id,
        hotel_id,
    } = *args;

    // Token allowlist
    require!(
        config
            .allowed_payment_tokens
            .contains(&ctx.accounts.token_mint.key()),
        CreateBookingPaymentErrorCode::TokenNotAllowed
    );

    // fee in bps
    let fee_amount = token_amount
        .checked_mul(config.booking_fee_bps as u64)
        .ok_or(CreateBookingPaymentErrorCode::Overflow)?
        / 10_000;

    let destination_amount = token_amount;

    let bp = &mut ctx.accounts.booking_payment;
    bp.user = ctx.accounts.user.key();
    bp.token_mint = ctx.accounts.token_mint.key();
    bp.hotel_id = hotel_id;
    bp.user_id = user_id;
    bp.total_amount = destination_amount
        .checked_add(fee_amount)
        .ok_or(CreateBookingPaymentErrorCode::Overflow)?;
    bp.fee_amount = fee_amount;
    bp.destination_amount = destination_amount;
    bp.status = BookingPaymentStatus::Pending;
    bp.bump = ctx.bumps.booking_payment;

    msg!(
        "Init booking payment intent: user={}, mint={}, total={}, fee={}, dest={}",
        bp.user,
        bp.token_mint,
        bp.total_amount,
        bp.fee_amount,
        bp.destination_amount
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateBookingPaymentArgs)]
pub struct InitBookingPayment<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + BookingPayment::INIT_SPACE,
        seeds = [
            b"booking_payment",
            user.key().as_ref(),
            booking_seed(&args.hotel_id, &args.user_id).as_ref()
        ],
        bump
    )]
    pub booking_payment: Account<'info, BookingPayment>,

    pub system_program: Program<'info, System>,
}

pub fn settle_booking_payment_handler(ctx: Context<SettleBookingPayment>) -> Result<()> {
    let config = &ctx.accounts.config;

    require_keys_eq!(
        ctx.accounts.admin.key(),
        config.admin,
        CreateBookingPaymentErrorCode::Forbidden
    );

    let booking_payment_ai = ctx.accounts.booking_payment.to_account_info();
    require!(
        !is_delegated(&booking_payment_ai),
        CreateBookingPaymentErrorCode::Forbidden
    );

    let bp = &mut ctx.accounts.booking_payment;

    require_keys_eq!(
        bp.user,
        ctx.accounts.user.key(),
        CreateBookingPaymentErrorCode::Forbidden
    );
    require_keys_eq!(
        bp.token_mint,
        ctx.accounts.token_mint.key(),
        CreateBookingPaymentErrorCode::Forbidden
    );

    require!(
        bp.status == BookingPaymentStatus::Pending,
        CreateBookingPaymentErrorCode::AlreadySettled
    );

    require!(
        config
            .allowed_payment_tokens
            .contains(&ctx.accounts.token_mint.key()),
        CreateBookingPaymentErrorCode::TokenNotAllowed
    );

    {
        let cpi_accounts_fee = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.fee_vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        transfer(
            CpiContext::new(cpi_program.clone(), cpi_accounts_fee),
            bp.fee_amount,
        )?;
    }

    {
        let cpi_accounts_dest = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx
                .accounts
                .destination_vault_token_account
                .to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        transfer(
            CpiContext::new(cpi_program, cpi_accounts_dest),
            bp.destination_amount,
        )?;
    }

    bp.status = BookingPaymentStatus::Settled;

    msg!(
        "Settled booking payment: user_id={}, hotel_id={}, total={}, mint={}",
        bp.user_id,
        bp.hotel_id,
        bp.total_amount,
        bp.token_mint
    );

    Ok(())
}
#[derive(Accounts)]
pub struct SettleBookingPayment<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub booking_payment: Account<'info, BookingPayment>,

    #[account(mut)]
    pub fee_vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub destination_vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
