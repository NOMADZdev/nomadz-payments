use crate::{
    errors::InitializeConfigErrorCode,
    state::config::config::{ Config, MAX_ALLOWED_TOKENS },
};
use anchor_lang::prelude::*;

pub fn initialize_handler(ctx: Context<Initialize>, args: Box<InitializeConfigArgs>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let admin = &ctx.accounts.admin;
    let fee_vault = &ctx.accounts.fee_vault;
    let destination_vault = &ctx.accounts.destination_vault;

    let InitializeConfigArgs { booking_fee_bps, allowed_payment_tokens } = *args;

    require!(
        allowed_payment_tokens.len() <= MAX_ALLOWED_TOKENS,
        InitializeConfigErrorCode::TooManyPaymentTokens
    );

    config.admin = admin.key();
    config.fee_vault = fee_vault.key();
    config.destination_vault = destination_vault.key();
    config.booking_fee_bps = booking_fee_bps;
    config.allowed_payment_tokens = allowed_payment_tokens;

    msg!(
        "Config initialized with admin: {:?}, fee_vault: {:?}, destination_vault: {:?}, booking_fee_bps: {:?}, allowed_payment_tokens: {:?}",
        config.admin,
        config.fee_vault,
        config.destination_vault,
        config.booking_fee_bps,
        config.allowed_payment_tokens
    );

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct InitializeConfigArgs {
    pub booking_fee_bps: u16,
    pub allowed_payment_tokens: Vec<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: InitializeConfigArgs)]
pub struct Initialize<'info> {
    #[account(init, payer = initializer, seeds = [b"config"], space = Config::LEN, bump)]
    pub config: Account<'info, Config>,

    // #[account(mut, constraint = contains_address(&ALLOWED_INITIALIZE_PROGRAM_AUTHORITIES, &initializer.key()) @ InitializeErrorCode::Forbidden)]
    #[account(mut)]
    pub initializer: Signer<'info>,

    /// CHECK: account constraints checked in account trait
    pub admin: AccountInfo<'info>,

    /// CHECK: account constraints checked in account trait
    pub fee_vault: AccountInfo<'info>,

    /// CHECK: account constraints checked in account trait
    pub destination_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
