import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxLength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxLength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      match: [/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minLength: [8, "Password must be at least 8 characters long"],
      validate: {
        validator: function (password) {
          // Check for at least 1 lowercase, 1 uppercase, 1 number, and 1 special character
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(
            password
          );
        },
        message:
          "Password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character",
      },
    },
    gender: {
      type: String,
      required: [true, "Gender is required"],
      enum: ["male", "female", "other", "prefer-not-to-say"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    balance: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional field for tracking admin who created the user
    },
  },
  {
    timestamps: true,
  }
);

// Compare password method (plaintext comparison)
userSchema.methods.comparePassword = async function (candidatePassword) {
  return candidatePassword === this.password;
};

const User = mongoose.model("User", userSchema);

export default User;
