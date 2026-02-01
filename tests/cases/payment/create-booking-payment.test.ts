import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as assert from "assert";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NomadzPayment } from "../../../target/types/nomadz_payment";
import { getAccount } from "../../../utils/account_utils";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as dotenv from "dotenv";
import { BN } from "bn.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

dotenv.config();

describe("PER-style booking payment (init + settle)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = anchor.workspace.NomadzPayment as Program<NomadzPayment>;

  let wallet: Keypair;
  let testMint: PublicKey;
  let feeVaultTokenAccount: PublicKey;
  let destVaultTokenAccount: PublicKey;
  let userTokenAccount: PublicKey;

  before(async () => {
    wallet = Keypair.fromSecretKey(bs58.decode(process.env.ADMIN_KEY || ""));

    const amount = 0.01 * anchor.web3.LAMPORTS_PER_SOL;

    console.log("User public key:", wallet.publicKey.toBase58());

    const testMintStr = getAccount<string>("newTestMint");
    if (!testMintStr) throw new Error("Test mint not found in storage");
    testMint = new PublicKey(testMintStr);

    const feeVault = new PublicKey(getAccount<string>("configFeeVault") || "");
    const destinationVault = new PublicKey(
      getAccount<string>("configDestinationVault") || "",
    );

    await connection.sendTransaction(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: feeVault,
          lamports: amount,
        }),
      ),
      [wallet],
    );

    await connection.sendTransaction(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: destinationVault,
          lamports: amount,
        }),
      ),
      [wallet],
    );

    // Create associated token accounts for user + fee vault + destination vault
    const userTokenAccountATA = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      testMint,
      wallet.publicKey,
      true,
    );
    const feeVaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      testMint,
      feeVault,
      true,
    );
    const destVaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      testMint,
      destinationVault,
      true,
    );

    feeVaultTokenAccount = feeVaultATA.address;
    destVaultTokenAccount = destVaultATA.address;
    userTokenAccount = userTokenAccountATA.address;

    console.log("Fee vault token account:", feeVaultTokenAccount.toBase58());
    console.log(
      "Destination vault token account:",
      destVaultTokenAccount.toBase58(),
    );
    console.log("User token account:", userTokenAccount.toBase58());
  });

  it("init creates/updates BookingPayment PDA; settle moves tokens and marks Settled", async () => {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );

    const tokenAmount = 100_000;
    const hotelId = "hotel123";
    const userId = "user123";

    const bookingSeed = anchor.utils.sha256.digest(
      `booking${hotelId}:${userId}`,
    );

    const [bookingPaymentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("booking_payment"),
        wallet.publicKey.toBuffer(),
        Buffer.from(bookingSeed),
      ],
      program.programId,
    );

    const feeVaultBefore =
      await program.provider.connection.getTokenAccountBalance(
        feeVaultTokenAccount,
      );
    const destVaultBefore =
      await program.provider.connection.getTokenAccountBalance(
        destVaultTokenAccount,
      );

    await program.methods
      .createBookingPayment({
        tokenAmount: new BN(tokenAmount),
        userId,
        hotelId,
      })
      .accounts({
        user: wallet.publicKey,
        config: configPda,
        tokenMint: testMint,
        bookingPayment: bookingPaymentPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();

    const bp = await program.account.bookingPayment.fetch(bookingPaymentPda);

    assert.strictEqual(bp.user.toBase58(), wallet.publicKey.toBase58());
    assert.strictEqual(bp.tokenMint.toBase58(), testMint.toBase58());
    assert.strictEqual(bp.hotelId, hotelId);
    assert.strictEqual(bp.userId, userId);

    const config = await program.account.config.fetch(configPda);
    const feeAmount = Math.floor((tokenAmount * config.bookingFeeBps) / 10_000);
    const destinationAmount = tokenAmount;

    assert.strictEqual(Number(bp.feeAmount), feeAmount);
    assert.strictEqual(Number(bp.destinationAmount), destinationAmount);
    assert.strictEqual(Number(bp.totalAmount), feeAmount + destinationAmount);

    if (typeof bp.status === "string") {
      assert.strictEqual(bp.status.toLowerCase(), "pending");
    } else if (typeof bp.status === "number") {
      // Pending = 0 in our Rust enum ordering
      assert.strictEqual(bp.status, 0);
    } else {
      // object form
      assert.ok("pending" in bp.status);
    }

    const feeVaultAfterInit =
      await program.provider.connection.getTokenAccountBalance(
        feeVaultTokenAccount,
      );
    const destVaultAfterInit =
      await program.provider.connection.getTokenAccountBalance(
        destVaultTokenAccount,
      );

    assert.strictEqual(
      Number(feeVaultAfterInit.value.amount),
      Number(feeVaultBefore.value.amount),
      "Fee vault must not change during init",
    );
    assert.strictEqual(
      Number(destVaultAfterInit.value.amount),
      Number(destVaultBefore.value.amount),
      "Destination vault must not change during init",
    );

    await program.methods
      .settleBookingPayment()
      .accounts({
        user: wallet.publicKey,
        userTokenAccount,
        admin: wallet.publicKey,
        config: configPda,
        tokenMint: testMint,
        bookingPayment: bookingPaymentPda,
        feeVaultTokenAccount,
        destinationVaultTokenAccount: destVaultTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([wallet])
      .rpc();

    const feeVaultAfter =
      await program.provider.connection.getTokenAccountBalance(
        feeVaultTokenAccount,
      );
    const destVaultAfter =
      await program.provider.connection.getTokenAccountBalance(
        destVaultTokenAccount,
      );

    const feeVault = new PublicKey(getAccount<string>("configFeeVault") || "");
    const destinationVault = new PublicKey(
      getAccount<string>("configDestinationVault") || "",
    );

    const feeDelta =
      Number(feeVaultAfter.value.amount) - Number(feeVaultBefore.value.amount);
    const destDelta =
      Number(destVaultAfter.value.amount) -
      Number(destVaultBefore.value.amount);

    assert.strictEqual(
      feeDelta,
      feeVault.toBase58() === destinationVault.toBase58()
        ? feeAmount + destinationAmount
        : feeAmount,
      "Fee vault balance should increase by fee amount",
    );

    assert.strictEqual(
      destDelta,
      feeVault.toBase58() === destinationVault.toBase58()
        ? feeAmount + destinationAmount
        : destinationAmount,
      "Destination vault balance should increase by destination amount",
    );

    const bpAfter =
      await program.account.bookingPayment.fetch(bookingPaymentPda);

    if (typeof bpAfter.status === "string") {
      assert.strictEqual(bpAfter.status.toLowerCase(), "settled");
    } else if (typeof bpAfter.status === "number") {
      assert.strictEqual(bpAfter.status, 1);
    } else {
      assert.ok("settled" in bpAfter.status);
    }
  });
});
