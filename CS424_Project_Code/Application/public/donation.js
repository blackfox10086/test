document.addEventListener("DOMContentLoaded", () => {
    const donationForm = document.getElementById("donationForm");
    const formWrap = document.getElementById("donationFormWrap");
    const thankYouBox = document.getElementById("thankYouBox");
    const messageBox = document.getElementById("donationMessageBox");

    donationForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("donorName").value.trim();
        const email = document.getElementById("donorEmail").value.trim();
        const phone = document.getElementById("donorPhone").value.trim();
        const amount = document.getElementById("donationAmount").value.trim();
        const currency = document.getElementById("donationCurrency").value;

        if (!name || !email || !phone || !amount || Number(amount) < 1) {
            messageBox.textContent = "Input not correct. Please enter again.";
            messageBox.className = "message error";
            donationForm.reset();
            return;
        }

        if (!/^\d{8}$/.test(phone)) {
            messageBox.textContent = "Please enter a valid 8-digit phone number.";
            messageBox.className = "message error";
            donationForm.reset();
            return;
        }

        try {
            const res = await fetch("/api/donations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name, email, phone, amount, currency })
            });

            const result = await res.json();

            if (!res.ok) {
                messageBox.textContent = result.message || "Donation failed.";
                messageBox.className = "message error";
                donationForm.reset();
                return;
            }

            messageBox.textContent = "";
            messageBox.className = "message";

            donationForm.reset();
            formWrap.classList.add("hidden");
            thankYouBox.classList.remove("hidden");

            setTimeout(() => {
                thankYouBox.classList.add("hidden");
                formWrap.classList.remove("hidden");
            }, 1000);
        } catch {
            messageBox.textContent = "Server connection failed.";
            messageBox.className = "message error";
        }
    });
});