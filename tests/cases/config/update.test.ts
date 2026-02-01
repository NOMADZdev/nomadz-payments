import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as assert from "assert";
import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { NomadzPayment } from "../../../target/types/nomadz_payment";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getAccount, saveAccount } from "../../../utils/account_utils";
import * as dotenv from "dotenv";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";

dotenv.config();

describe("update config based on initialize", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    const program = anchor.workspace.NomadzPayment as Program<NomadzPayment>;

    let wallet: Keypair;
    let testMint: PublicKey;

    const newFeeVault = new PublicKey(
        "CwKJ22GahUScYc5m63gdtfyKLg8Hg8DuzBjwCBdprqv5",
    );
    const newBookingFeeBps = 200; // Example: 2%

    before(async () => {
        wallet = Keypair.fromSecretKey(
            bs58.decode(process.env.ADMIN_KEY || ""),
        );

        console.log(
            "Admin balance:",
            await connection.getBalance(wallet.publicKey),
        );

        // 1️⃣ Create a new SPL token mint
        testMint = await createMint(
            connection,
            wallet,
            wallet.publicKey,
            null,
            6,
        );
        console.log("Created test mint:", testMint.toBase58());

        // 2️⃣ Create admin ATA and mint tokens
        const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            wallet,
            testMint,
            wallet.publicKey,
        );
        await mintTo(
            connection,
            wallet,
            testMint,
            adminTokenAccount.address,
            wallet,
            1_000_000_000,
        );
        console.log(
            "Minted 1,000 tokens to admin ATA:",
            adminTokenAccount.address.toBase58(),
        );

        // Save new mint and fee vault
        saveAccount("newTestMint", testMint.toBase58());
        saveAccount("newFeeVault", newFeeVault.toBase58());
    });

    it("Updates config: booking fee, fee vault, and allowed payment tokens", async () => {
        const configPda = new PublicKey(getAccount<string>("config") || '');

        const before = await program.account.config.fetch(configPda);
        console.log("Before update:", before);

        // Combine existing allowedPaymentTokens + new mint
        const allowedPaymentTokens = [
            ...(before.allowedPaymentTokens || []),
            testMint,
        ];

        // Call updateConfig instruction
        const tx = await program.methods
            .updateConfig({
                bookingFeeBps: newBookingFeeBps,
                feeVault: newFeeVault,
                allowedPaymentTokens: allowedPaymentTokens,
                admin: null,
                destinationVault: null,
            })
            .accounts({
                config: configPda,
                admin: wallet.publicKey,
                newAdmin: wallet.publicKey,
                newFeeVault: newFeeVault,
                newDestinationVault: null,
            })
            .transaction();

        const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
        console.log("Transaction signature:", sig);

        const after = await program.account.config.fetch(configPda);
        console.log("After update:", after);

        // Assertions
        assert.ok(
            after.admin.equals(wallet.publicKey),
            "Admin should match wallet",
        );
        assert.ok(after.feeVault.equals(newFeeVault), "Fee vault updated");
        assert.strictEqual(
            after.bookingFeeBps,
            newBookingFeeBps,
            "Booking fee updated",
        );
        assert.ok(
            after.allowedPaymentTokens.some((t: PublicKey) =>
                t.equals(testMint),
            ),
            "New token mint should be in allowedPaymentTokens",
        );

        saveAccount("config", configPda.toBase58());
    });
});
