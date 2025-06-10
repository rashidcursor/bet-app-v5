'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const Header = () => {
    return (
        <header className="bg-green-600 text-white">
            {/* Top navigation bar */}
            <div className="bg-green-700 px-4 py-2 hidden md:block">
                <div className="flex justify-end items-center space-x-4 text-sm">
                    <Link href="#" className="hover:underline">Community</Link>
                    <span className="hidden lg:inline">|</span>
                    <Link href="#" className="hover:underline hidden lg:inline">Help</Link>
                    <span className="hidden lg:inline">|</span>
                    <Link href="#" className="hover:underline">Responsible Gaming</Link>
                    <span className="hidden xl:inline">|</span>
                    <Link href="#" className="hover:underline hidden xl:inline">About Us</Link>
                    <span className="hidden xl:inline">|</span>
                    <Link href="#" className="hover:underline hidden xl:inline">Blog</Link>
                    <span className="hidden xl:inline">|</span>
                    <Link href="#" className="hover:underline">Apps</Link>
                </div>
            </div>

            {/* Main header */}
            <div className="px-4 py-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4 lg:space-x-8">
                        <div className="text-xl lg:text-2xl font-bold">
                            UNIBET
                            <div className="text-xs text-green-200">KINDRED</div>
                        </div>

                        <nav className="hidden md:flex items-center space-x-2 lg:space-x-6">
                            <div className="flex items-center space-x-1 cursor-pointer hover:bg-green-500 px-2 lg:px-3 py-2 rounded text-sm lg:text-base">
                                <span>Sports</span>
                                <span className="text-xs">▼</span>
                            </div>
                            <div className="flex items-center space-x-1 cursor-pointer hover:bg-green-500 px-2 lg:px-3 py-2 rounded text-sm lg:text-base">
                                <span>Casino</span>
                                <span className="text-xs">▼</span>
                            </div>
                            <span className="cursor-pointer hover:bg-green-500 px-2 lg:px-3 py-2 rounded text-sm lg:text-base hidden lg:inline">Live Casino</span>
                            <span className="cursor-pointer hover:bg-green-500 px-2 lg:px-3 py-2 rounded text-sm lg:text-base hidden lg:inline">Games</span>
                            <div className="hidden xl:flex items-center space-x-1 cursor-pointer hover:bg-green-500 px-3 py-2 rounded">
                                <span>Bingo</span>
                                <span className="text-xs">▼</span>
                            </div>
                            <div className="hidden xl:flex items-center space-x-1 cursor-pointer hover:bg-green-500 px-3 py-2 rounded">
                                <span>Poker</span>
                                <span className="text-xs">▼</span>
                            </div>
                            <span className="cursor-pointer hover:bg-green-500 px-2 lg:px-3 py-2 rounded text-sm lg:text-base hidden xl:inline">Promotions</span>
                        </nav>

                        {/* Mobile menu button */}
                        <button className="md:hidden p-2 hover:bg-green-500 rounded">
                            <span className="text-lg">☰</span>
                        </button>
                    </div>

                    <div className="flex items-center space-x-2 lg:space-x-3">
                        <Button variant="outline" className="text-green-600 border-white hover:bg-white text-xs lg:text-sm px-2 lg:px-4 py-1 lg:py-2">
                            Log in
                        </Button>
                        <Button className="bg-yellow-500 text-black hover:bg-yellow-400 text-xs lg:text-sm px-2 lg:px-4 py-1 lg:py-2">
                            Register
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
