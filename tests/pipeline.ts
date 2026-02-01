import { execSync } from "child_process";

describe("Testing Pipeline", () => {
    it("Runs all tests in sequence", () => {
        // uncomment required test file
        const testFiles = [
            // config tests
            "config/initialize.test.ts",
            "config/update.test.ts",

            // payment tests
            "payment/create-booking-payment.test.ts",
        ];

        for (const testFile of testFiles) {
            console.log(`Running ${testFile}...`);
            execSync(
                `pnpm ts-mocha -p ./tsconfig.json -t 1000000 tests/cases/${testFile}`,
                {
                    stdio: "inherit",
                },
            );
        }
    });
});
