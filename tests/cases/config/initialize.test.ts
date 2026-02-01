import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as assert from "assert";
import {
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
} from "@solana/web3.js";
import { NomadzPayment } from "../../../target/types/nomadz_payment";
import { getAccount, saveAccount } from "../../../utils/account_utils";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import * as dotenv from "dotenv";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";

dotenv.config();

describe("initialize", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // const wallet = provider.wallet.payer as anchor.web3.Keypair;
    const configFeeVault = new PublicKey(
        "CwKJ22GahUScYc5m63gdtfyKLg8Hg8DuzBjwCBdprqv5",
    );
    const configDestinationVault = new PublicKey(
        "CwKJ22GahUScYc5m63gdtfyKLg8Hg8DuzBjwCBdprqv5",
    );
    const configBookingFeeBps = 100; // 1 bps = 0.01% fee
    const configAllowedPaymentTokens = [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
    ];
    let wallet: Keypair;
    let testMint: PublicKey;

    before(async () => {
        wallet = Keypair.fromSecretKey(
            bs58.decode(process.env.ADMIN_KEY || ""),
        );

        testMint = await createMint(
            connection,
            wallet,
            wallet.publicKey,
            null,
            6,
        );

        console.log("Created test mint:", testMint.toBase58());

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
            "Minted tokens to admin ATA:",
            adminTokenAccount.address.toBase58(),
        );

        configAllowedPaymentTokens.push(testMint.toBase58());
        saveAccount("testMint", testMint.toBase58());

        saveAccount("configFeeVault", configFeeVault.toBase58());
        saveAccount(
            "configDestinationVault",
            configDestinationVault.toBase58(),
        );
        saveAccount("configAllowedPaymentTokens", configAllowedPaymentTokens);
        // await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);
        // await new Promise(res => setTimeout(res, 1000));
        console.log(
            await connection.getBalance(
                new PublicKey(process.env.ADMIN_PUBLIC_KEY || ""),
            ),
        );
    });

    const connection = provider.connection;

    const program = anchor.workspace.NomadzPayment as Program<NomadzPayment>;

    it("Initializes config", async () => {
        const configFeeVault = getAccount<string>("configFeeVault");
        const configDestinationVault = getAccount<string>(
            "configDestinationVault",
        );
        const configAllowedPaymentTokens = getAccount<string[]>(
            "configAllowedPaymentTokens",
        );

        if (!configFeeVault) {
            throw new Error("Config fee vault was not provided");
        }

        if (!configDestinationVault) {
            throw new Error("Config destination vault was not provided");
        }

        if (!configAllowedPaymentTokens) {
            throw new Error("Config allowed payment tokens were not provided");
        }

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId,
        );

        const configAccountInfo = await connection.getAccountInfo(configPda);

        if (!configAccountInfo?.data?.length) {
            console.log("Config not found, initializing...");
            const tx = await program.methods
                .initialize({
                    bookingFeeBps: configBookingFeeBps,
                    allowedPaymentTokens: configAllowedPaymentTokens.map(
                        (token) => new PublicKey(token),
                    ),
                })
                .accounts({
                    config: configPda,
                    initializer: wallet.publicKey,
                    admin: wallet.publicKey,
                    feeVault: new PublicKey(configFeeVault),
                    destinationVault: new PublicKey(configDestinationVault),
                    systemProgram: SystemProgram.programId,
                })
                .transaction();

            const sig = await sendAndConfirmTransaction(connection, tx, [
                wallet,
            ]);
            console.log("Transaction signature:", sig);
        } else {
            console.log("Config already initialized.");
        }

        const account = await program.account.config.fetch(configPda);
        console.log("Fetched Config:", account);

        saveAccount("config", configPda.toBase58());

        assert.ok(
            account.admin.equals(wallet.publicKey),
            "Admin should match wallet public key",
        );
        assert.ok(
            account.feeVault.toBase58() === configFeeVault,
            "Fee vault should match config fee vault public key",
        );
        assert.ok(
            account.destinationVault.toBase58() === configDestinationVault,
            "Fee vault should match config fee vault public key",
        );
        assert.strictEqual(
            account.bookingFeeBps,
            configBookingFeeBps,
            "Booking fee bps must match the config booking fee bps",
        );
    });
});
