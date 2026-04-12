// convert plaintext passwords to bcrypt hashes

const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcrypt");

(async () => {
    try {
        const usersFile = path.join(__dirname, "A.json");

        const raw = await fs.readFile(usersFile, "utf8");
        const users = JSON.parse(raw);

        for (const u of users) {
            // hash users' plaintext password
            if (u.password && !u.passwordHash) {
                const hash = await bcrypt.hash(u.password, 10); // 10 salt rounds
                u.passwordHash = hash;
                delete u.password;
                console.log(`Hashed password for ${u.email}`);
            }
        }

        await fs.writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
        console.log("Updated A.json with password hashes");
    } catch (err) {
        console.error("Error hashing users:", err);
    }
})();