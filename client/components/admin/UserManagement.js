"use client";

import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  MoreHorizontal,
  Search,
  Plus,
  Trash2,
  Trophy,
  History,
  Eye,
  Sliders,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Shield,
  UserPlus,
  User,
  ArrowUpDown,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchUsers,
  searchUsers,
  updateUserStatus,
  deleteUser,
  selectAdminUsers,
  selectPagination,
  selectIsLoading,
  selectError,
  selectMessage,
  clearError,
  clearMessage,
  resetErrorState,
} from "@/lib/features/admin/adminUserSlice";
import CreateUserDialog from "./CreateUserDialog";
import TransactionDialog from "./TransactionDialog";
import { useRouter } from "next/navigation";

export default function UserManagement({ searchQuery = "", statusFilter = "all", roleFilter = "all" }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const users = useSelector(selectAdminUsers);
  const pagination = useSelector(selectPagination);
  const loading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const message = useSelector(selectMessage);

  // State
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [localSearch, setLocalSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);

  // Add new state for transaction dialog
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Clear error on mount
  useEffect(() => {
    dispatch(resetErrorState());
    dispatch(clearMessage());

    return () => {
      dispatch(resetErrorState());
    };
  }, [dispatch]);

  // Initial load
  useEffect(() => {
    dispatch(resetErrorState());

    dispatch(fetchUsers({ page: 1, limit: pageSize }))
      .unwrap()
      .then(() => {
        dispatch(resetErrorState());
      })
      .catch(() => {
        setTimeout(() => dispatch(resetErrorState()), 100);
      });
  }, [dispatch]);

  // Effect to handle search query changes from parent
  useEffect(() => {
    // Clear any existing errors first
    dispatch(resetErrorState());

    // Only perform search if query is at least 3 characters
    if (searchQuery && searchQuery.trim() && searchQuery.trim().length >= 3) {
      setLocalSearch(searchQuery);

      // Use client-side filtering instead of API call
      // This avoids server errors and provides instant results
      if (users && users.length > 0) {
        // We already have users loaded, just filter them in the component
        // No need to make an API call
      } else {
        // If we don't have users yet, fetch them first
        dispatch(fetchUsers({ page: 1, limit: 50 }))
          .unwrap()
          .then(() => dispatch(resetErrorState()))
          .catch(() => setTimeout(() => dispatch(resetErrorState()), 100));
      }
    }
    // When search is cleared, reset to initial state if needed
    else if (searchQuery === "" && localSearch !== "") {
      setLocalSearch("");

      // Fetch first page of users when search is cleared
      dispatch(fetchUsers({ page: 1, limit: 10 }))
        .unwrap()
        .then(() => dispatch(resetErrorState()))
        .catch(() => setTimeout(() => dispatch(resetErrorState()), 100));
    }
  }, [searchQuery, dispatch, localSearch, users]);

  // Handlers
  const handleStatusChange = (userId, newStatus) => {
    dispatch(updateUserStatus({ userId, isActive: newStatus }));
  };

  const handleDeleteUser = (user) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (userToDelete) {
      try {
        await dispatch(deleteUser(userToDelete._id)).unwrap();
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        dispatch(fetchUsers({ page: 1, limit: 10 }));
      } catch (error) {
        setTimeout(() => dispatch(resetErrorState()), 100);
      }
    }
  };

  const cancelDeleteUser = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  // Add new handler for transaction button
  const handleTransactionClick = (user) => {
    setSelectedUser(user);
    setShowTransactionDialog(true);
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    // Filter by status
    if (statusFilter !== "all") {
      if (statusFilter === "active" && !user.isActive) return false;
      if (statusFilter === "inactive" && user.isActive) return false;
    }

    // Filter by role
    if (roleFilter !== "all" && user.role !== roleFilter) return false;

    // Filter by search query (client-side filtering)
    if (searchQuery && searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const email = user.email ? user.email.toLowerCase() : "";
      const phone = user.phoneNumber || "";

      return (
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header with Create User Button */}
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-4 md:mb-0">User Management</h1>
          <div className="flex gap-3 items-center">
            <Button
              onClick={() => setShowCreateUserDialog(true)}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none px-4"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border-l-4 border-red-500 mb-6">
          {error}
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch(resetErrorState())}
            className="ml-4"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Success Message */}
      {message && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700 border-l-4 border-green-500 mb-6">
          {message}
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch(clearMessage())}
            className="ml-4"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Users Table */}
      <Card className="rounded-none shadow-none px-2 py-2 gap-0">
        <CardContent className="p-1">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-[13px]">
                  <TableHead className="cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      Name
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      Email
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      Phone
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      Status
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      Role
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin h-8 w-8 border-4 border-gray-200 rounded-full border-t-blue-600 mb-2"></div>
                        <p>Loading users...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <Search className="h-8 w-8 text-gray-300 mb-2" />
                        <p>No users found</p>
                        <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filter</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user._id} className="hover:bg-gray-50 text-[13px]">
                      <TableCell className="font-medium">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.phoneNumber}</TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "success" : "destructive"} className={user.isActive ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-rose-100 text-rose-800 hover:bg-rose-100'}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className={user.role === "admin" ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : 'bg-gray-100 text-gray-800 hover:bg-gray-100'}
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleTransactionClick(user)}
                            >
                              <Wallet className="h-4 w-4 mr-2" />
                              Deposit/Withdraw
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => { router.push("/betting-history") }}
                            >
                              <History className="h-4 w-4 mr-2" />
                              View Betting History
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                (window.location.href = `/admin/users/${user._id}`)
                              }
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Pagination */}
        {filteredUsers.length > 0 && pagination && (
          <div className="flex flex-col sm:flex-row justify-between items-center mt-1 pt-4 border-t gap-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing {filteredUsers.length} of {pagination?.totalUsers || filteredUsers.length} users
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show</span>
                <Select 
                  value={String(pageSize)} 
                  onValueChange={(value) => {
                    const newSize = Number(value);
                    setPageSize(newSize);
                    dispatch(resetErrorState());
                    dispatch(fetchUsers({ page: 1, limit: newSize }))
                      .unwrap()
                      .then(() => dispatch(resetErrorState()))
                      .catch(() => {
                        setTimeout(() => dispatch(resetErrorState()), 100);
                      });
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue placeholder="10" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-600">entries</span>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  dispatch(resetErrorState());
                  dispatch(fetchUsers({ page: (pagination?.currentPage || 1) - 1, limit: 10 }))
                    .unwrap()
                    .then(() => dispatch(resetErrorState()))
                    .catch(() => {
                      setTimeout(() => dispatch(resetErrorState()), 100);
                    });
                }}
                disabled={(pagination?.currentPage || 1) === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center">
                {Array.from({ length: Math.min((pagination?.totalPages || 1), 5) }).map((_, i) => {
                  const currentPage = pagination?.currentPage || 1;
                  const totalPages = pagination?.totalPages || 1;
                  
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={i}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 mx-0.5"
                      onClick={() => {
                        dispatch(resetErrorState());
                        dispatch(fetchUsers({ page: pageNum, limit: 10 }))
                          .unwrap()
                          .then(() => dispatch(resetErrorState()))
                          .catch(() => {
                            setTimeout(() => dispatch(resetErrorState()), 100);
                          });
                      }}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  dispatch(resetErrorState());
                  dispatch(fetchUsers({ page: (pagination?.currentPage || 1) + 1, limit: 10 }))
                    .unwrap()
                    .then(() => dispatch(resetErrorState()))
                    .catch(() => {
                      setTimeout(() => dispatch(resetErrorState()), 100);
                    });
                }}
                disabled={(pagination?.currentPage || 1) === (pagination?.totalPages || 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      

      </Card>

      {/* Create User Dialog */}
      <CreateUserDialog
        isOpen={showCreateUserDialog}
        onClose={() => setShowCreateUserDialog(false)}
      />

      {/* Transaction Dialog */}
      <TransactionDialog
        isOpen={showTransactionDialog}
        onClose={() => setShowTransactionDialog(false)}
        user={selectedUser}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                {userToDelete?.firstName} {userToDelete?.lastName}
              </span>
              ? This action cannot be undone and will permanently remove the
              user from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteUser}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
