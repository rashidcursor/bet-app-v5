"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Settings,
  LogOut,
  CreditCard,
  History,
  Trophy,
  CircleDollarSign,
} from "lucide-react";
import LoginDialog from "@/components/auth/LoginDialog";
import { useCustomSidebar } from "@/contexts/SidebarContext.js";
import { useSelector, useDispatch } from "react-redux";
import {
  selectIsAuthenticated,
  selectUser,
  selectIsLoading,
  logout,
} from "@/lib/features/auth/authSlice";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import SecondaryNavigation from "@/components/SecondaryNavigation";

const Header = () => {
  const { toggleMobileSidebar, isMobile } = useCustomSidebar();
  const dispatch = useDispatch();
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // Redux selectors
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const isLoading = useSelector(selectIsLoading);
  const handleLogout = async () => {
    try {
      await dispatch(logout()).unwrap();
      toast.success("Logged out successfully");
      setShowLogoutDialog(false);
      router.push("/");
    } catch (error) {
      toast.error("Logout failed");
      setShowLogoutDialog(false);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutDialog(true);
  };

  const getUserInitials = (user) => {
    if (!user) return "U";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  };

  return (
    <header className="bg-base text-white fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] md:sticky md:left-auto md:right-auto md:z-50 md:pt-0">
      {/* Top navigation bar */}
      <div className="bg-base-dark px-4 py-2 hidden md:block">
        <div className="flex justify-end items-center space-x-4 text-sm">
          <Link href="#" className="hover:underline">
            Community
          </Link>
          <span className="hidden lg:inline">|</span>
          <Link href="#" className="hover:underline hidden lg:inline">
            Help
          </Link>
          <span className="hidden lg:inline">|</span>
          <Link href="#" className="hover:underline">
            Responsible Gaming
          </Link>
          <span className="hidden xl:inline">|</span>
          <Link href="#" className="hover:underline hidden xl:inline">
            About Us
          </Link>
          <span className="hidden xl:inline">|</span>
          <Link href="#" className="hover:underline hidden xl:inline">
            Blog
          </Link>
          <span className="hidden xl:inline">|</span>
          <Link href="#" className="hover:underline">
            Apps
          </Link>
        </div>
      </div>

      {/* Main header */}
      <div className="px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 md:space-x-4 lg:space-x-4">
            {isMobile && (
              <button
                className="p-2 px-0  hover:bg-green-500 rounded"
                onClick={toggleMobileSidebar}
              >
                <span className="text-lg">☰</span>
              </button>
            )}
            <Link href={"/"} className="text-xl lg:text-2xl font-bold">
              BETTING
              <div className="text-xs text-green-200">KINDRED</div>
            </Link>{" "}
            {/* Mobile menu button */}
          </div>
          <div className="flex items-center space-x-2 lg:space-x-3">
            {isAuthenticated ? (
              // Authenticated user menu
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="flex items-center space-x-2 h-auto p-2 rounded-lg transition-colors active:scale-0 focus:outline-none focus:ring-0 focus-visible:ring-0 data-[state=open]:bg-green-500/10">
                    {/* Compact balance and name display */}
                    <div className="hidden md:flex items-center space-x-2 text-xs">
                      <span className="text-gray-200">
                        {user?.firstName || "User"}
                      </span>
                      {user?.role !== 'admin' && (
                        <div className="flex items-center space-x-1 bg-warning/10 px-2 py-1 rounded-md">
                          <CircleDollarSign className="h-3 w-3 text-warning" />
                          <span className="text-warning font-semibold text-xs">
                            ${user?.balance?.toFixed(2) || "0.00"}
                          </span>
                        </div>
                      )}
                    </div>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-warning text-black font-semibold">
                        {getUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56"
                  align="end"
                  sideOffset={8}
                  avoidCollisions={true}
                >
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                      {user?.role !== 'admin' && (
                        <div className="text-xs leading-none text-base font-semibold flex items-center space-x-1">
                          <CircleDollarSign className="h-3 w-3" />
                          <span>
                            Balance: ${user?.balance?.toFixed(2) || "0.00"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />{" "}
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />{" "}
                 
                  <DropdownMenuItem asChild>
                    <Link href="/transactions">
                      <History className="mr-2 h-4 w-4" />
                      <span>Transaction History</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/betting-history">
                      <Trophy className="mr-2 h-4 w-4" />
                      <span>Bet History</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />{" "}
                  <DropdownMenuItem
                    onClick={handleLogoutClick}
                    disabled={isLoading}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>{" "}
              </DropdownMenu>
            ) : (
              // Guest user buttons
              <>
                <LoginDialog>
                  <Button
                    variant="outline"
                    className="text-black border-warning   bg-warning hover:bg-warning-dark transition-all text-xs lg:text-sm px-2 lg:px-4 py-1 lg:py-2"
                  >
                    Log in
                  </Button>
                </LoginDialog>
                
              </>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Navigation - merged with header */}
      {!pathname?.startsWith('/admin') && <SecondaryNavigation />}

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You'll need to sign in again to
              access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={"px-1 py-1"} disabled={isLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              disabled={isLoading}
              className="bg-red-500 py-1 px-2 hover:bg-red-600 "
            >
              {isLoading ? "Logging out..." : "Log out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};

export default Header;
