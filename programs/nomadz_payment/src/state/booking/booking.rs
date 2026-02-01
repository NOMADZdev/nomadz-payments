use super::status::BookingPaymentStatus;
use anchor_lang::prelude::*;

#[account]
pub struct BookingPayment {
    pub user: Pubkey,
    pub token_mint: Pubkey,

    pub hotel_id: String,
    pub user_id: String,

    pub total_amount: u64,
    pub fee_amount: u64,
    pub destination_amount: u64,

    pub status: BookingPaymentStatus,
    pub bump: u8,
}

impl BookingPayment {
    pub const HOTEL_ID_MAX: usize = 64;
    pub const USER_ID_MAX: usize = 64;

    pub const INIT_SPACE: usize = 32 + // user
        32 + // token_mint
        4 + Self::HOTEL_ID_MAX + // hotel_id string
        4 + Self::USER_ID_MAX +  // user_id string
        8 + // total_amount
        8 + // fee_amount
        8 + // destination_amount
        1 + // status enum
        1; // bump
}
