use anchor_lang::prelude::*;

#[error_code]
pub enum UpdateConfigErrorCode {
    #[msg("Invalid admin pubkey was provided. Admin must be the signer")]
    InvalidAdminPubkey,
    #[msg("New admin from args does not match with address passed into accounts list")]
    NewAdminPubkeyMismatch,
    #[msg("New fee vault from args does not match with address passed into accounts list")]
    NewFeeVaultPubkeyMismatch,
    #[msg("New destination vault from args does not match with address passed into accounts list")]
    NewDestinationVaultPubkeyMismatch,
    #[msg("Too many payment tokens were provided")]
    TooManyPaymentTokens,
    #[msg("Unknown error has occured while updating config")]
    UnknownError,
}
