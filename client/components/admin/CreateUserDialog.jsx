"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Eye, EyeOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { useDispatch, useSelector } from "react-redux"
import { createUser, selectIsLoading, selectError, selectMessage, clearError, clearMessage } from "@/lib/features/admin/adminUserSlice"
import { toast } from "sonner"

//INFO: Zod validation schema for admin user creation
const createUserSchema = z.object({
    firstName: z.string().min(1, "First name is required").min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(1, "Last name is required").min(2, "Last name must be at least 2 characters"),
    email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
    phoneNumber: z.string()
        .min(1, "Phone number is required")
        .regex(/^[\+]?[1-9][\d]{0,15}$/, "Please enter a valid phone number"),    password: z.string()
        .min(1, "Password is required")
        .min(8, "Password must be at least 8 characters")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
            "Password must contain at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character"),
    gender: z.string().min(1, "Gender is required"),
    role: z.string().min(1, "Role is required"),
    isActive: z.boolean(),
})

const CreateUserDialog = ({ isOpen, onClose, children }) => {
    const [showPassword, setShowPassword] = useState(false)
    const dispatch = useDispatch()

    // Redux selectors
    const isLoading = useSelector(selectIsLoading)
    const error = useSelector(selectError)
    const message = useSelector(selectMessage)

    const form = useForm({
        resolver: zodResolver(createUserSchema),        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            phoneNumber: "",
            password: "",
            gender: "",
            role: "user",
            isActive: true,
        },
    })

    // Handle error messages
    useEffect(() => {
        if (error) {
            toast.error(error)
            dispatch(clearError())
        }
    }, [error, dispatch])

    // Handle success messages
    useEffect(() => {
        if (message && message.includes("successfully")) {
            toast.success(message)
            dispatch(clearMessage())
            form.reset()
            onClose()
        }
    }, [message, dispatch, form, onClose])

    const onSubmit = async (data) => {
        try {
            console.log("Create user data:", data)
            await dispatch(createUser(data)).unwrap()
        } catch (error) {
            console.error("Create user error:", error)
            toast.error("Failed to create user")        }
    }

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword)
    }

    const genders = [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "other", label: "Other" },
        { value: "prefer-not-to-say", label: "Prefer not to say" },
    ]

    const roles = [
        { value: "user", label: "User" },
        { value: "admin", label: "Admin" },
    ]

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* Name Fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-gray-700">
                                            First name <span className="text-red-500">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="text"
                                                placeholder="First name"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-xs" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="lastName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-gray-700">
                                            Last name <span className="text-red-500">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="text"
                                                placeholder="Last name"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-xs" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Email Field */}
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Email <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder="user@email.com"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Phone Number Field */}
                        <FormField
                            control={form.control}
                            name="phoneNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Phone Number <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="tel"
                                            placeholder="+1234567890"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Password Field */}
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Password <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                {...field}
                                            />
                                            <button
                                                type="button"
                                                onClick={togglePasswordVisibility}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                                                <span className="text-xs">Show</span>
                                            </button>
                                        </div>
                                    </FormControl>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Minimum 8 characters, including at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 special character.
                                    </div>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}                        />

                        {/* Gender Field */}
                        <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Gender <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a gender" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {genders.map((gender) => (
                                                    <SelectItem key={gender.value} value={gender.value}>
                                                        {gender.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Role Field */}
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Role <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roles.map((role) => (
                                                    <SelectItem key={role.value} value={role.value}>
                                                        {role.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Active Status Field */}
                        <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-gray-700">
                                        Account Status <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Select value={field.value ? "true" : "false"} onValueChange={(value) => field.onChange(value === "true")}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select account status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="true">Active</SelectItem>
                                                <SelectItem value="false">Inactive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-3 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                {isLoading ? "Creating User..." : "Create User"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default CreateUserDialog
