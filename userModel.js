const mongoose = require("mongoose");
const validator = require("validator");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "A user must have an email"],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "A user must have a valid emain"],
  },
  password: {
    type: String,
    required: [true, "A user must have a password"],
    minlength: 8,
    select: false,
  },
  privateKey: {
    type: String,
    select: false,
  },
  hexAddress: {
    type: String,
    select: false,
  },
  address: {
    type: String,
    select: false,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
