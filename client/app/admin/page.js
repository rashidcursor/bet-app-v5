'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UserManagement from '@/components/admin/UserManagement';
import { fetchUserStats, selectUserStats, selectIsLoading } from '@/lib/features/admin/adminUserSlice';
import { selectUser, selectIsAuthenticated } from '@/lib/features/auth/authSlice';

export default function AdminDashboard() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector(selectUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const stats = useSelector(selectUserStats);
  const loading = useSelector(selectIsLoading);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.role !== 'admin') {
      router.push('/');
      return;
    }

    console.log('Fetching user stats...');
    dispatch(fetchUserStats())
      .unwrap()
      .then((result) => {
        console.log('Stats fetch result:', result);
      })
      .catch((error) => {
        console.error('Stats fetch error:', error);
      });
  }, [dispatch, user, isAuthenticated, router]);

  console.log("Current stats state:", stats);
  console.log("Loading state:", loading);

  if (!isAuthenticated || !user) {
    return null; // Will redirect in useEffect
  }

  if (user.role !== 'admin') {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">User Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats?.totalUsers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats?.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {loading ? '...' : `${stats?.percentageActive}% of total users`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats?.recentUsers}</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Management Section */}
      <div className="mt-8">
      
        <UserManagement />
      </div>
    </div>
  );
}