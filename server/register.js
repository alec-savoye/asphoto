const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "users.json");

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
}

function generateCode() {
  return crypto.randomBytes(8).toString("hex");
}

function createInviteCode() {
  const data = readData();
  const code = generateCode();
  data.inviteCodes.push({ code, used: false });
  writeData(data);
  return code;
}

function validateInviteCode(code) {
  const data = readData();
  const entry = data.inviteCodes.find(
    (c) => c.code === code && !c.used
  );
  return !!entry;
}

function consumeInviteCode(code) {
  const data = readData();
  const entry = data.inviteCodes.find(
    (c) => c.code === code && !c.used
  );
  if (!entry) return false;
  entry.used = true;
  writeData(data);
  return true;
}

function addUser(username, passwordHash) {
  const data = readData();
  if (data.users.find((u) => u.username === username)) return false;
  data.users.push({ username, passwordHash });
  writeData(data);
  return true;
}

function userExists(username) {
  const data = readData();
  return data.users.some((u) => u.username === username);
}

module.exports = {
  createInviteCode,
  validateInviteCode,
  consumeInviteCode,
  addUser,
  userExists,
  readData,
};
