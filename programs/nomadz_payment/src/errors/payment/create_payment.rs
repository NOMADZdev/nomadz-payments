use anchor_lang::prelude::*;

#[error_code]
pub enum CreateBookingPaymentErrorCode {
    #[msg("Forbidden")]
    Forbidden,

    #[msg("Token not allowed")]
    TokenNotAllowed,

    #[msg("Math overflow")]
    Overflow,

    #[msg("Already settled")]
    AlreadySettled,
}
