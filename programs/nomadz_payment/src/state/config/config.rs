use anchor_lang::prelude::*;

pub const MAX_ALLOWED_TOKENS: usize = 20;

#[account]
pub struct Config {
    pub booking_fee_bps: u16, // 1 bps = 0.01%, 100 bps = 1%, 10000 bps = 100%
    pub admin: Pubkey,
    pub fee_vault: Pubkey,
    pub destination_vault: Pubkey,
    pub allowed_payment_tokens: Vec<Pubkey>,
    pub padding: [u8; 512],
}

impl Config {
    pub const LEN: usize = 8 + 2 + 32 + 32 + 32 + 4 + 32 * MAX_ALLOWED_TOKENS + 512;
}
