"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSelector, useDispatch } from "react-redux"
import { updateProfile, clearError, clearMessage } from "@/lib/features/auth/authSlice"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Mail, Calendar, Edit, Save, X, Shield, Loader2, CheckCircle, AlertCircle } from "lucide-react"

const ProfilePage = () => {
  const dispatch = useDispatch()
  // Replace the useSelector with this memoized version:
const authState = useSelector((state) => state.auth, (left, right) => 
  left.user === right.user && 
  left.isLoading === right.isLoading && 
  left.error === right.error && 
  left.message === right.message

)

const { user, isLoading, error, message } = authState

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    gender: "",
  })
  const [formErrors, setFormErrors] = useState({})
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        gender: user.gender || "",
      })
    }
  }, [user])
  // Clear error and message when component unmounts
  useEffect(() => {
    return () => {
      dispatch(clearError())
      dispatch(clearMessage())
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current)
      }
    }
  }, [dispatch])
  
  // Clear validation errors when entering edit mode (but don't clear success/error messages)
  useEffect(() => {
    if (isEditing) {
      setFormErrors({})
    }
  }, [isEditing])



const inputTimeoutRef = useRef(null)

// Replace handleInputChange with this debounced version:
const handleInputChange = useCallback((field, value) => {
  setFormData(prev => {
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      return {
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      };
    }
    return { ...prev, [field]: value };
  });
}, []);



    const validateForm = useCallback((dataToValidate) => {
    const errors = {}
    
    // Validate required fields - use simple checks
    if (!dataToValidate.firstName?.trim()) {
      errors.firstName = "First name is required"
    }
    
    if (!dataToValidate.lastName?.trim()) {
      errors.lastName = "Last name is required"
    }
      // Only validate phone number if it's not empty
    if (dataToValidate.phoneNumber?.trim()) {
      const phoneNumber = dataToValidate.phoneNumber.trim()
      // Remove all non-digit characters to count actual digits
      const digitsOnly = phoneNumber.replace(/\D/g, '')
      
      // Check if it has exactly 11 digits
      if (digitsOnly.length !== 11) {
        errors.phoneNumber = "Phone number must have exactly 11 digits"
      } else if (!/^[\+\d\s\-\(\)]+$/.test(phoneNumber)) {
        errors.phoneNumber = "Please enter a valid phone number format"      }
    }
    
    return { errors, isValid: Object.keys(errors).length === 0 }
  }, []) // Remove formData dependency
  
  const handleSave = useCallback(async () => {
    console.log('🔄 Starting profile update...')
    
    // Validate the form before submitting
    const validation = validateForm(formData)
    console.log('✅ Validation result:', validation)
    setFormErrors(validation.errors)
    
    if (!validation.isValid) {
      console.log('❌ Validation failed, stopping')
      return // Don't proceed if the form is invalid
    }

    try {      // Prepare the data for the API call efficiently
      const updateData = {
        firstName: formData.firstName?.trim(),
        lastName: formData.lastName?.trim(),
        phoneNumber: formData.phoneNumber?.trim() || undefined,
        gender: formData.gender || undefined,
      }
      
      console.log('📤 Sending update data:', updateData)
      
      // Dispatch the update profile action
      const result = await dispatch(updateProfile(updateData)).unwrap()
      console.log('✅ Update successful:', result)
      
      // If successful, exit editing mode
      setIsEditing(false)
    } catch (error) {
      console.error('❌ Profile update failed:', error)
      // Error is handled by Redux, but let's also check what the error is
      if (error?.message) {
        console.error('Error message:', error.message)
      }
    }
  }, [dispatch, validateForm, formData])
  
  const handleCancel = useCallback(() => {
    // Reset form data to original values efficiently
    if (user) {      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        gender: user.gender || "",
      })
    }
    setFormErrors({}) // Clear any validation errors
    setIsEditing(false)  }, [user])
  
  const getAccountAge = useCallback(() => {
    if (!user?.createdAt) return "N/A"
    const created = new Date(user.createdAt)
    const now = new Date()
    const diffTime = Math.abs(now - created)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 30) return `${diffDays} days`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`
    return `${Math.floor(diffDays / 365)} years`
  }, [user?.createdAt])

  const getInitials = useCallback(() => {
    const firstName = user?.firstName || ""
    const lastName = user?.lastName || ""
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }, [user?.firstName, user?.lastName])
  
  // Auto-clear success messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        dispatch(clearMessage())
      }, 5000) // Clear success message after 5 seconds
      
      return () => clearTimeout(timer)
    }
  }, [message, dispatch])

  // Auto-clear error messages after 8 seconds  
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        dispatch(clearError())
      }, 8000) // Clear error message after 8 seconds
      
      return () => clearTimeout(timer)
    }  }, [error, dispatch])

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading profile...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 min-[375px]:max-[390px]:px-8 min-[375px]:max-[390px]:py-8 sm:px-4 sm:py-4 lg:p-6 max-w-7xl pb-[calc(1.25rem+env(safe-area-inset-bottom))] min-[375px]:max-[390px]:pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:pb-6">
        {/* Header Section */}
        <div className="mb-6 lg:mb-8 ">
          <div className="flex flex-col space-y-4 lg:space-y-0 sm:flex-row sm:justify-between items-center   lg:gap-6">
            {/* Profile Header with Avatar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 mx-auto sm:mx-0">
                <AvatarImage src={user?.profileImage || "/placeholder.svg"} alt={`${user?.firstName || ''} ${user?.lastName || ''}`} />
                <AvatarFallback className="text-lg  font-semibold bg-primary text-primary-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  {user?.firstName || ''} {user?.lastName || ''}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm break-all sm:break-normal">{user?.email || ''}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 flex-wrap">
                  <Badge variant={user?.isActive ? "secondary" : "destructive"} className={`text-xs ${user?.isActive ? "bg-base text-white" : ""}`}>
                    {user?.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {user?.role || ''}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Action Buttons */}            
            <div className="flex gap-2 justify-center lg:justify-end ">
              {!isEditing ? (
                <Button onClick={() => {
                  setIsEditing(true)
                  setFormErrors({})
                  dispatch(clearError())
                  dispatch(clearMessage())
                }} variant="outline" className="flex items-center gap-2 py-2 px-3 text-[13px] w-full sm:w-auto">
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button 
                    onClick={handleSave} 
                    disabled={isLoading}
                    className="flex items-center gap-2 py-2 px-3 text-[13px] flex-1 sm:flex-none"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button 
                    onClick={handleCancel} 
                    variant="outline" 
                    disabled={isLoading}
                    className="flex items-center gap-2 py-2 px-2 text-[13px] flex-1 sm:flex-none"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>



          </div>        </div>

        {/* Success/Error Messages */}
        {message && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {message}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          {/* Account Information Sidebar */}
          <div className="xl:col-span-1 order-2 xl:order-1">
            <Card className="rounded-none shadow-none">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2  lg:text-lg">
                  <Shield className="h-4 w-4 lg:h-5 lg:w-5" />
                  Account Information
                </CardTitle>
              </CardHeader><CardContent className="space-y-4">
                {user?.role !== 'admin' && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Account Balance</label>
                    <p className="text-sm text-foreground mt-1 font-semibold">${user.balance?.toFixed(2) || '0.00'}</p>
                  </div>
                )}
                <Separator />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                  <p className="text-sm text-foreground mt-1">{getAccountAge()}</p>
                </div>
                <Separator />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Account Status</label>
                  <div className="mt-1">
                    <Badge variant={user.isActive ? "secondary" : "destructive"} className={`text-xs ${user.isActive ? "bg-base text-white" : ""}`}>
                      {user.isActive ? "Active Account" : "Inactive Account"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Role</label>
                  <div className="mt-1">
                    <Badge variant="secondary" className="capitalize"  >
                      {user.role}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>          {/* Main Profile Information */}
          <div className="xl:col-span-2 order-1 xl:order-2">
            <Card className="rounded-none shadow-none">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2  lg:text-lg">
                  <User className="h-4 w-4 lg:h-5 lg:w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 lg:space-y-6">
                {/* Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    {isEditing ? (
                      <Input
                        value={formData.firstName}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                        className="text-[13px]"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-muted/50 rounded-md">
                        <p className="text-[13px] text-foreground">{user.firstName || "Not provided"}</p>
                      </div>
                    )}
                    {formErrors.firstName && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    {isEditing ? (
                      <Input
                        value={formData.lastName}
                        onChange={(e) => handleInputChange("lastName", e.target.value)}
                        className="text-[13px]"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-muted/50 rounded-md">
                        <p className="text-[13px] text-foreground">{user.lastName || "Not provided"}</p>
                      </div>
                    )}
                    {formErrors.lastName && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Contact Information */}
                <div className="space-y-3 lg:space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Contact Information
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Email Address</label>
                      <div className="px-3 py-2 bg-muted/50 rounded-md">
                        <p className="text-[13px] text-foreground break-all">{user.email}</p>
                      </div>
                      {isEditing && (
                        <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Phone Number</label>                      {isEditing ? (
                        <div>
                          <Input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                            className="text-[13px]"
                            placeholder="e.g., 01712345678 (11 digits)"
                            maxLength={15} // Allow some formatting characters
                          />
                          
                          {formErrors.phoneNumber && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.phoneNumber}</p>
                          )}
                        </div>
                      ) : (                        <div className="px-3 py-2 bg-muted/50 rounded-md">
                          <p className="text-[13px] text-foreground">{user.phoneNumber || "Not provided"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Personal Details */}
                <div className="space-y-3 lg:space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Personal Details
                  </h3>                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Gender</label>
                      {isEditing ? (
                        <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                          <SelectTrigger className="text-[13px]">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                            <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="px-3 py-2 bg-muted/50 rounded-md">
                          <p className="text-[13px] text-foreground capitalize">
                            {user.gender === "prefer-not-to-say" ? "Prefer not to say" : user.gender || "Not provided"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(ProfilePage)