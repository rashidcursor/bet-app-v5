// Validation utility functions for user management

export const validateUserData = (data) => {
  const errors = [];

  // Required fields
  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "phoneNumber",
    "password",
    "gender",
  ];

  requiredFields.forEach((field) => {
    if (!data[field]) {
      errors.push(`${field} is required`);
    }
  });

  // Email validation
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
    errors.push("Please enter a valid email address");
  }

  // Password validation
  if (data.password) {
    if (data.password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(
        data.password
      )
    ) {
      errors.push(        "Password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character"
      );
    }
  }

  // Phone number validation
  if (data.phoneNumber && !/^\+?[\d\s\-\(\)]+$/.test(data.phoneNumber)) {
    errors.push("Please enter a valid phone number");
  }

  // Gender validation
  if (
    data.gender &&
    !["male", "female", "other", "prefer-not-to-say"].includes(data.gender)
  ) {
    errors.push("Please select a valid gender option");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateLoginData = (data) => {
  const errors = [];

  if (!data.email) {
    errors.push("Email is required");
  } else if (!/^\S+@\S+\.\S+$/.test(data.email)) {
    errors.push("Please enter a valid email address");
  }

  if (!data.password) {
    errors.push("Password is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validatePasswordChange = (data) => {
  const errors = [];

  if (!data.currentPassword) {
    errors.push("Current password is required");
  }

  if (!data.newPassword) {
    errors.push("New password is required");
  } else {
    if (data.newPassword.length < 8) {
      errors.push("New password must be at least 8 characters long");
    }

    if (
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(
        data.newPassword
      )
    ) {
      errors.push(
        "New password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character"
      );
    }
  }

  if (data.currentPassword === data.newPassword) {
    errors.push("New password must be different from current password");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
