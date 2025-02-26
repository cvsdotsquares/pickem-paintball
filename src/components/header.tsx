'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Drawer from './drawer';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';

const Header: React.FC = () => {
    const [lastScrollY, setLastScrollY] = useState(0);
    const [scrollDirection, setScrollDirection] = useState<string | null>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    const navItems = [
        { label: 'About', id: 'about' },
        { label: 'Services', id: 'services' },
        { label: 'Testimonial', id: 'reviews' },
    ];
    const router = useRouter()

    const handleGoToApp = () => {
        router.push('/dashboard')
    }

    const handleScroll = useCallback(() => {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY) {
            setScrollDirection('down');
        } else {
            setScrollDirection('up');
        }
        setLastScrollY(currentScrollY);

        setIsScrolled(currentScrollY > 50); // Adjust scroll threshold
    }, [lastScrollY]);

    const handleNavigation = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };


    useEffect(() => {
        const onScroll = () => {
            requestAnimationFrame(handleScroll);
        };
        window.addEventListener('scroll', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
        };
    }, [handleScroll]);

    return (
        <header
            className={`w-full bg-black p-2 flex justify-center transition-transform duration-500 ${scrollDirection === 'down' ? '-translate-y-full' : 'translate-y-0'
                } ${isScrolled ? 'bg-black' : 'bg-transparent'}`}
        >
            <div className="w-full max-w-[1545px] flex justify-between items-center">
                {/* Logo Section */}
                <div className="w-[287px] flex justify-center font-bold text-white font">
                    Pick&apos;em Paintball
                    {/* <a href="/" aria-label="Go to homepage">
                        <img
                            loading="lazy"
                            src="..."
                            alt="Company logo"
                            className="object-contain max-w-[260px] min-w-[240px] w-full"
                        />
                    </a> */}
                </div>
                <div className="md:hidden absolute z-[99] top-4 right-5">
                    <Drawer />
                </div>
                {/* Navigation */}
                <nav className="flex-grow md:flex hidden justify-center max-w-[734px]">
                    <ul className="flex space-x-12 text-md font-black font-sans uppercase">
                        {/* {navItems.map((item, index) => (
                            <li key={index} className="whitespace-nowrap">
                                <button
                                    onClick={() => handleNavigation(item.id)}
                                    className="p-2 text-white hover:text-neutral-400 transition-colors"
                                >
                                    {item.label}
                                </button>
                            </li>
                        ))} */}
                    </ul>
                </nav>

                {/* Get a Quote Button */}
                <div className="md:flex hidden text-center">
                    <Button
                        onClick={handleGoToApp}
                        className="bg-white text-black hover:bg-gray-300 font-extrabold font-mono    text-lg py-2 px-6 transition-colors duration-300"
                    >
                        Register/Login
                    </Button>
                </div>
            </div>
        </header>
    );
};

export default React.memo(Header);
