const loginAttempts = new Map();  // in-memory storage

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