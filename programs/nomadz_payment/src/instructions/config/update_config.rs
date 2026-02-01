use crate::{ errors::UpdateConfigErrorCode, state::config::config::{ Config, MAX_ALLOWED_TOKENS } };
use anchor_lang::prelude::*;

pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    args: Box<UpdateConfigArgs>
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let admin = &ctx.accounts.admin;

    require!(admin.key() == config.admin, UpdateConfigErrorCode::InvalidAdminPubkey);

    let UpdateConfigArgs {
        admin: new_admin,
        booking_fee_bps,
        destination_vault,
        fee_vault,
        allowed_payment_tokens,
    } = *args;

    if let Some(new_allowed_payment_tokens) = allowed_payment_tokens {
        require!(
            new_allowed_payment_tokens.len() <= MAX_ALLOWED_TOKENS,
            UpdateConfigErrorCode::TooManyPaymentTokens
        );

        msg!(
            "Updated config allowed payment tokens. Old payment tokens: {:?}, new payment tokens: {:?}",
            config.allowed_payment_tokens,
            new_allowed_payment_tokens
        );

        config.allowed_payment_tokens = new_allowed_payment_tokens;
    }

    if let Some(new_admin) = new_admin {
        let provided_account = ctx.accounts.new_admin
            .as_ref()
            .ok_or(UpdateConfigErrorCode::NewAdminPubkeyMismatch)?;

        require_keys_eq!(
            provided_account.key(),
            new_admin,
            UpdateConfigErrorCode::NewAdminPubkeyMismatch
        );

        msg!(
            "Updated config admin account. Old admin: {:?}, new admin: {:?}",
            config.admin,
            new_admin
        );
        config.admin = new_admin;
    }

    if let Some(new_fee_vault) = fee_vault {
        let provided_account = ctx.accounts.new_fee_vault
            .as_ref()
            .ok_or(UpdateConfigErrorCode::NewFeeVaultPubkeyMismatch)?;

        require_keys_eq!(
            provided_account.key(),
            new_fee_vault,
            UpdateConfigErrorCode::NewFeeVaultPubkeyMismatch
        );

        msg!(
            "Updated config fee vault account. Old fee vault: {:?}, new fee vault: {:?}",
            config.fee_vault,
            new_fee_vault
        );
        config.fee_vault = new_fee_vault;
    }

    if let Some(new_destination_vault) = destination_vault {
        let provided_account = ctx.accounts.new_destination_vault
            .as_ref()
            .ok_or(UpdateConfigErrorCode::NewDestinationVaultPubkeyMismatch)?;

        require_keys_eq!(
            provided_account.key(),
            new_destination_vault,
            UpdateConfigErrorCode::NewDestinationVaultPubkeyMismatch
        );

        msg!(
            "Updated config destination vault account. Old destination vault: {:?}, new destination vault: {:?}",
            config.destination_vault,
            new_destination_vault
        );
        config.destination_vault = new_destination_vault;
    }

    if let Some(new_booking_fee_bps) = booking_fee_bps {
        msg!(
            "Updated config booking fee bps. Old booking fee bps: {:?}, new booking fee bps: {:?}",
            config.booking_fee_bps,
            new_booking_fee_bps
        );
        config.booking_fee_bps = new_booking_fee_bps;
    }

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Debug, Clone)]
pub struct UpdateConfigArgs {
    pub admin: Option<Pubkey>,
    pub fee_vault: Option<Pubkey>,
    pub destination_vault: Option<Pubkey>,
    pub booking_fee_bps: Option<u16>,
    pub allowed_payment_tokens: Option<Vec<Pubkey>>,
}

#[derive(Accounts)]
#[instruction(args: UpdateConfigArgs)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,

    /// CHECK: passed explicitly and validated in logic
    pub new_admin: Option<AccountInfo<'info>>,

    /// CHECK: passed explicitly and validated in logic
    pub new_fee_vault: Option<AccountInfo<'info>>,

    /// CHECK: account constraints checked in account trait
    pub new_destination_vault: Option<AccountInfo<'info>>,
}
