let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginSection = document.getElementById("loginSection");
  const recordSection = document.getElementById("recordSection");
  const loginMessage = document.getElementById("loginMessage");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const logoutBtn = document.getElementById("logoutBtn");
  const recordTableBody = document.getElementById("recordTableBody");
  const recordMessage = document.getElementById("recordMessage");

  // Listen for the login form submission
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    try {
      // Send login data to the backend API as JSON
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      // Convert the JSON response from the server into a JS object
      const result = await res.json();

      //Clear input fields after submssion
      emailInput.value = "";
      passwordInput.value = "";

      // If login failed, show the returned error message
      if (!res.ok) {
        loginMessage.textContent = result.message || "Invalid email or password";
        loginMessage.className = "message error";
        return;
      }

      currentUser = result.user;

      loginMessage.textContent = "";
      loginMessage.className = "message";

      loginSection.classList.add("hidden");
      recordSection.classList.remove("hidden");

      loadDonationRecords();
    } catch {
      loginMessage.textContent = "Server connection failed";
      loginMessage.className = "message error";
    }
  });

  logoutBtn.addEventListener("click", () => {
    currentUser = null;
    loginSection.classList.remove("hidden");
    recordSection.classList.add("hidden");

    loginForm.reset();
    loginMessage.textContent = "";
    loginMessage.className = "message";

    recordTableBody.innerHTML = "";
    recordMessage.textContent = "";
    recordMessage.className = "message";
  });
});

// XSS-safe render of records using textContent.
function renderRecords(records) {
  const tableBody = document.getElementById("recordTableBody");

  // Clear any existing rows
  tableBody.innerHTML = "";

  records.forEach((record, index) => {
    const tr = document.createElement("tr");

    const idTd = document.createElement("td");
    idTd.textContent = String(index + 1);

    const typeTd = document.createElement("td");
    typeTd.textContent = record.type;

    const nameTd = document.createElement("td");
    nameTd.textContent = record.name;

    const amountTd = document.createElement("td");
    amountTd.textContent = record.amount.toLocaleString();

    const dateTd = document.createElement("td");
    dateTd.textContent = record.date;

    tr.appendChild(idTd);
    tr.appendChild(typeTd);
    tr.appendChild(nameTd);
    tr.appendChild(amountTd);
    tr.appendChild(dateTd);

    tableBody.appendChild(tr);
  });
}

async function loadDonationRecords() {
  const recordMessage = document.getElementById("recordMessage");

  try {
    const res = await fetch("/api/records", {
      headers: {
        "x-user-email": currentUser.email,
        "x-user-role": currentUser.role
      }
    });

    const records = await res.json();

    if (!res.ok) {
      recordMessage.textContent = records.message || "Cannot load records";
      recordMessage.className = "message error";
      return;
    }

    renderRecords(records);

    recordMessage.textContent =
      "Welcome " + currentUser.name + " (" + currentUser.role + ") !";
    recordMessage.className = "message success";
  } catch {
    recordMessage.textContent = "Server connection failed";
    recordMessage.className = "message error";
  }
}