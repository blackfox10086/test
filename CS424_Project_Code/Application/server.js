const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const USERS_FILE = path.join(PUBLIC_DIR, "A.json");
const RECORDS_FILE = path.join(PUBLIC_DIR, "DR.json");

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function sanitizeText(value) {
    // Accepts raw user input and applies security-focused validation/sanitization:
    // it normalizes the value to a string, trims it, and strips angle brackets
    return String(value).trim().replace(/[<>]/g, "");
}

function sanitizeEmail(value) {
    // Sanitizes user input by normalizing to a trimmed, lowercase string,
    // producing a canonical email value
    return String(value).trim().toLowerCase();
}


const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

//simple in-memory rate limiter for login
const loginAttempts = new Map();

function checkLoginRateLimit(key) {
    const now = Date.now();
    const entry = loginAttempts.get(key);

    if (!entry) {
        loginAttempts.set(key, { count: 1, lastAttempt: now });
        return true;
    }

    if (now - entry.lastAttempt > WINDOW_MS) {
        loginAttempts.set(key, { count: 1, lastAttempt: now });
        return true;
    }

    entry.count += 1;
    entry.lastAttempt = now;

    if (entry.count > MAX_ATTEMPTS) {
        return false;
    }

    return true;
}

// NEW: periodic cleanup of old entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts.entries()) {
        if (now - entry.lastAttempt > WINDOW_MS) {
            loginAttempts.delete(key);   // (C) free the entry from the Map
        }
    }
}, WINDOW_MS);

function getKey() {
    const secret = process.env.AES_SECRET;
    if (!secret) throw new Error("AES_SECRET is missing");
    return crypto.createHash("sha256").update(secret).digest();
}


// Encrypt value using AES-256-CBC and return { iv, value }
function encryptText(plainText) {
    try {
        const key = getKey();

        // Generate a new random IV for every encryption operation
        const iv = crypto.randomBytes(16);

        // AES-256-CBC encryption
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

        let encrypted = cipher.update(String(plainText), "utf8", "base64");
        encrypted += cipher.final("base64");

        // Store IV together with ciphertext so it can be decrypted later
        return {
            iv: iv.toString("base64"),
            value: encrypted
        };
    } catch (err) {
        throw new Error("Encryption failed");
    }
}

// Decrypt value previously produced by encryptText() function
function decryptText(encryptedField) {
    try {
        if (
            !encryptedField ||
            typeof encryptedField !== "object" ||
            !encryptedField.iv ||
            !encryptedField.value
        ) {
            return encryptedField;
        }

        const key = getKey();
        const iv = Buffer.from(encryptedField.iv, "base64");

        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

        let decrypted = decipher.update(encryptedField.value, "base64", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch {
        return null;
    }
}


// all encrypted fields decrypted into plaintext strings
function decryptRecord(record) {
    return {
        ...record,
        type: decryptText(record.type),
        name: decryptText(record.name),
        email: decryptText(record.email),
        phone: decryptText(record.phone),
        amount: decryptText(record.amount),
        date: decryptText(record.date)
    };
}

async function readJson(filePath) {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function Auth(req, res, next) {
    const email = req.header("x-user-email");
    const role = req.header("x-user-role");

    if (!email || !role) {
        return res.status(401).json({ message: "Missing auth headers" });
    }

    req.user = { email, role };
    next();
}

app.get("/", (req, res) => {
    res.redirect("/donation");
});

app.get("/donation", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "donation.html"));
});

app.get("/staff", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "staff.html"));
});

// login with validation and sanitization
app.post("/api/login", async (req, res) => {
    try {
        let { email, password } = req.body;

        // Validate presence and types
        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({ message: "Invalid login data" });
        }

        // Apply basic sanitization
        email = sanitizeEmail(email);
        password = password.trim();

        // Simple rate limiting per email identifier
        const allowed = checkLoginRateLimit(email);
        if (!allowed) {
            // Generic message, do not say "too many attempts" to avoid account enumeration
            return res.status(429).json({ message: "Invalid email or password" });
        }

        const users = await readJson(USERS_FILE);

        // Users now should store hashed passwords as user.passwordHash
        const user = users.find(u => u.email === email);

        if (!user || !user.passwordHash) {
            // Generic message: do not reveal whether email or password is wrong
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Compare plaintext input with stored bcrypt hash
        const ok = await bcrypt.compare(password, user.passwordHash);

        if (!ok) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        res.json({
            message: "Login successful",
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch {
        res.status(500).json({ message: "Login failed" });
    }
});

app.get("/api/records", Auth, async (req, res) => {
    try {
        const records = await readJson(RECORDS_FILE);

        // First decrypt all records
        const decryptedRecords = records.map(decryptRecord);

        // Then filter using decrypted type
        const visible =
            req.user.role === "Manager"
                ? decryptedRecords
                : decryptedRecords.filter(r => r.type === "individual");

        res.json(visible);
    } catch (err) {
        res.status(500).json({ message: "Cannot load records" });
    }
});

app.get("/api/records/:index", Auth, async (req, res) => {
    try {
        const records = await readJson(RECORDS_FILE);
        const index = Number(req.params.index);

        if (!Number.isInteger(index) || index < 0 || index >= records.length) {
            return res.status(404).json({ message: "Record not found" });
        }

        const record = records[index];

        if (req.user.role !== "Admin" && record.type !== "individual") {
            return res.status(403).json({ message: "Forbidden" });
        }

        // Decrypt protected fields before returning one record
        res.json(decryptRecord(record));
    } catch (err) {
        res.status(500).json({ message: "Cannot load record" });
    }
});

// validated, sanitized, and AES-encrypted donation data
app.post("/api/donations", async (req, res) => {
    try {
        let { name, email, phone, amount, currency } = req.body;

        if (!name || !email || !phone || !amount || !currency) {
            return res.status(400).json({ message: "Invalid donation data" });
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string" ||
            typeof currency !== "string"
        ) {
            return res.status(400).json({ message: "Invalid donation data" });
        }

        amount = Number(amount);
        if (!Number.isFinite(amount) || amount < 1) {
            return res.status(400).json({ message: "Invalid donation amount" });
        }

        if (!/^\d{8}$/.test(phone)) {
            return res.status(400).json({ message: "Phone must be 8 digits" });
        }

        currency = currency.trim().toUpperCase();

        // allow only selected 3-letter currency codes
        const allowedCurrencies = ["HKD", "USD", "EUR", "GBP", "JPY", "CNY"];
        if (!allowedCurrencies.includes(currency)) {
            return res.status(400).json({ message: "Invalid currency" });
        }

        name = sanitizeText(name);
        email = sanitizeEmail(email);
        phone = phone.trim();

        let hkdAmount = amount;
        let exchangeRate = 1;

        // External API route uses fetch() to call Frankfurter for dollar exchangeRate 
        // instead of using exec("curl ..."), so user input is not passed into a shell command.
        // That is a recommended to prevent command injection.
        if (currency !== "HKD") {
            const baseUrl = "https://api.frankfurter.app/latest";
            const url = `${baseUrl}?from=${encodeURIComponent(currency)}&to=HKD`;

            // Set timeout for fetch
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000); // 3 秒 timeout

            let response;
            try {
                response = await fetch(url, { signal: controller.signal });
            } catch (err) {
                if (err.name === "AbortError") {
                    return res.status(504).json({ message: "Exchange rate request timed out" });
                }
                return res.status(502).json({ message: "Failed to fetch exchange rate" });
            } finally {
                clearTimeout(timeout);
            }

            const data = await response.json();

            if (!response.ok || !data.rates || typeof data.rates.HKD !== "number") {
                return res.status(502).json({ message: "Failed to fetch exchange rate" });
            }

            exchangeRate = data.rates.HKD;
            hkdAmount = amount * exchangeRate;
        }

        const records = await readJson(RECORDS_FILE);

        const newRecord = {
            id: crypto.randomUUID(),
            type: encryptText("individual"),
            name: encryptText(name),
            email: encryptText(email),
            phone: encryptText(phone),
            amount: encryptText(String(hkdAmount.toFixed(2))),
            date: encryptText(new Date().toISOString().split("T")[0])
        };

        records.push(newRecord);
        await writeJson(RECORDS_FILE, records);

        res.status(201).json({
            message: "Donation saved successfully",
            record: {
                id: newRecord.id
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Cannot save donation securely" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});