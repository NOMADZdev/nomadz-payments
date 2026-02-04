use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("FBMUQfqb8m4p8gBYcxrL255UWa5rWmFv4qEf2BBngZcd");

#[program]
pub mod nomadz_payment {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: Box<InitializeConfigArgs>) -> Result<()> {
        instructions::config::initialize::initialize_handler(ctx, args)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: Box<UpdateConfigArgs>) -> Result<()> {
        instructions::config::update_config::update_config_handler(ctx, args)
    }

    pub fn create_booking_payment(
        ctx: Context<InitBookingPayment>,
        args: Box<CreateBookingPaymentArgs>,
    ) -> Result<()> {
        instructions::payment::create_booking_payment::init_booking_payment_handler(ctx, args)
    }

    pub fn settle_booking_payment(ctx: Context<SettleBookingPayment>) -> Result<()> {
        instructions::payment::create_booking_payment::settle_booking_payment_handler(ctx)
    }
}
