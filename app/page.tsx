"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import the navigation menu to avoid SSR issues
const NavigationMenu = dynamic(() => import("./navigation-menu"), {
  ssr: false,
  loading: () => (
    <div className="w-48 h-10 bg-slate-800 rounded-lg animate-pulse"></div>
  ),
});

interface NavigationOption {
  value: string;
  label: string;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("features");

  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        "features",
        "image-management",
        "page-discovery",
        "console-output",
        "tools",
        "tech",
        "legal",
      ];
      const scrollPosition = window.scrollY + 100; // Offset for header height

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (
            scrollPosition >= offsetTop &&
            scrollPosition < offsetTop + offsetHeight
          ) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Check initial position

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navigationOptions: NavigationOption[] = [
    { value: "features", label: "Features" },
    { value: "image-management", label: "Images" },
    { value: "page-discovery", label: "Discovery" },
    { value: "console-output", label: "Output" },
    { value: "tools", label: "Tools" },
    { value: "tech", label: "Tech Stack" },
    { value: "legal", label: "Legal" },
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80; // Account for sticky header height
      const elementPosition = element.offsetTop;
      const offsetPosition = elementPosition - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-sm font-bold text-white">ZH</span>
              </div>
              <h1 className="text-xl font-bold text-white">Zeroheight MCP</h1>
            </div>
            {/* Desktop Navigation - Horizontal on md to lg, Dropdown on xl+ */}
            <nav className="hidden space-x-8 lg:flex">
              <button
                onClick={() => scrollToSection("features")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "features"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Features
                {activeSection === "features" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("image-management")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "image-management"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Images
                {activeSection === "image-management" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("page-discovery")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "page-discovery"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Discovery
                {activeSection === "page-discovery" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("console-output")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "console-output"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Output
                {activeSection === "console-output" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("tools")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "tools"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Tools
                {activeSection === "tools" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("tech")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "tech"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Tech Stack
                {activeSection === "tech" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => scrollToSection("legal")}
                className={`relative transform transition-all duration-500 ease-in-out hover:scale-105 ${
                  activeSection === "legal"
                    ? "border-b-2 border-cyan-400 pb-1 text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Legal
                {activeSection === "legal" && (
                  <div className="absolute -bottom-1 left-0 h-0.5 w-full animate-pulse bg-cyan-400"></div>
                )}
              </button>
            </nav>

            {/* Dropdown Menu for Large Screens */}
            <div className="lg:hidden w-48">
              <NavigationMenu
                activeSection={activeSection}
                navigationOptions={navigationOptions}
                onSectionChange={setActiveSection}
                onScrollToSection={scrollToSection}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Full Width */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/30 to-purple-900/40"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-purple-600/10"></div>
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"></div>
        <div className="absolute right-1/4 bottom-0 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl"></div>

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <div className="text-center">
            <h1 className="mb-6 text-5xl leading-tight font-bold text-white md:text-7xl">
              Zeroheight Design System
              <span className="block animate-pulse bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                MCP Server
              </span>
            </h1>
            <p className="mx-auto mb-12 max-w-4xl text-xl leading-relaxed text-slate-300 md:text-2xl">
              A powerful Model Context Protocol server that scrapes, indexes,
              and provides intelligent querying capabilities for Zeroheight
              design system documentation. Built for design systems teams who
              need programmatic access to their component libraries and design
              guidelines.
            </p>
            <div className="flex flex-col justify-center gap-6 sm:flex-row">
              <Link
                href="#tools"
                className="transform rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-10 py-4 text-lg font-semibold text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:from-cyan-600 hover:to-blue-700 hover:shadow-cyan-500/25"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/drexxdk/zeroheight-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border-2 border-slate-400 bg-slate-800/30 px-10 py-4 text-lg font-semibold text-slate-300 backdrop-blur-sm transition-all duration-300 hover:border-cyan-400 hover:bg-slate-700/50 hover:text-white"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {/* Features Section */}
        <section id="features" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            Key Features
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-900">
                  <svg
                    className="h-6 w-6 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Intelligent Scraping
                </h3>
              </div>
              <p className="text-slate-400">
                Automatically discovers and scrapes all pages, components, and
                documentation from your Zeroheight design system with smart link
                following and content extraction.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-900">
                  <svg
                    className="h-6 w-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Powerful Search
                </h3>
              </div>
              <p className="text-slate-400">
                Query your design system data with full-text search across
                titles, content, and URLs. Find components, patterns, and
                guidelines instantly.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-900">
                  <svg
                    className="h-6 w-6 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  MCP Integration
                </h3>
              </div>
              <p className="text-slate-400">
                Built on the Model Context Protocol for seamless integration
                with AI assistants, design tools, and development workflows.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-900">
                  <svg
                    className="h-6 w-6 text-orange-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Image Management
                </h3>
              </div>
              <p className="text-slate-400">
                Automatically downloads, processes, and stores design system
                images and assets with optimized storage and fast retrieval.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-900">
                  <svg
                    className="h-6 w-6 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Secure Access
                </h3>
              </div>
              <p className="text-slate-400">
                Enterprise-grade authentication with API key validation and
                secure access controls for your design system data.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-900">
                  <svg
                    className="h-6 w-6 text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  High Performance
                </h3>
              </div>
              <p className="text-slate-400">
                Optimized for speed with bulk database operations, progress
                tracking, and efficient caching for large design systems.
              </p>
            </div>
          </div>
        </section>

        {/* Image Management Section */}
        <section id="image-management" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            🖼️ Image Management
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Supported Image Types
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 font-medium text-green-400">
                    ✅ Supported
                  </h4>
                  <ul className="space-y-1 text-sm text-slate-400">
                    <li>• PNG - Portable Network Graphics</li>
                    <li>• JPG/JPEG - Joint Photographic Experts Group</li>
                    <li>• WebP - Modern web image format</li>
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 font-medium text-red-400">
                    ❌ Filtered Out
                  </h4>
                  <ul className="space-y-1 text-sm text-slate-400">
                    <li>• GIF - Graphics Interchange Format</li>
                    <li>• SVG - Scalable Vector Graphics</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Upload Process
              </h3>
              <p className="mb-4 text-slate-400">
                Images are automatically downloaded from Zeroheight and uploaded
                to Supabase Storage buckets with intelligent deduplication.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>
                    Each image gets a unique path based on MD5 hash for
                    efficient deduplication
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>
                    Query results include complete Supabase storage URLs for
                    direct access
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Duplicate Prevention
              </h3>
              <p className="mb-4 text-slate-400">
                MD5 hashing ensures identical images are never uploaded twice,
                minimizing storage costs.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    Existing images are detected and reused instead of
                    re-uploading
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    Storage costs are minimized through intelligent
                    deduplication
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Image Optimization
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <div className="mb-2 text-2xl">📸</div>
                  <h4 className="mb-1 font-medium text-cyan-400">
                    Format Conversion
                  </h4>
                  <p className="text-sm text-slate-400">
                    All images converted to JPEG format
                  </p>
                </div>
                <div className="text-center">
                  <div className="mb-2 text-2xl">⚡</div>
                  <h4 className="mb-1 font-medium text-cyan-400">
                    Quality Reduction
                  </h4>
                  <p className="text-sm text-slate-400">
                    Reduced to 80% quality
                  </p>
                </div>
                <div className="text-center">
                  <div className="mb-2 text-2xl">📐</div>
                  <h4 className="mb-1 font-medium text-cyan-400">
                    Resolution Limiting
                  </h4>
                  <p className="text-sm text-slate-400">
                    Max 1920px on longest side
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Page Discovery Section */}
        <section id="page-discovery" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            🔍 Page Discovery and Redirect Handling
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Page Discovery
              </h3>
              <p className="mb-4 text-slate-400">
                The scraper intelligently discovers and processes pages while
                maintaining efficiency.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>Starts with the configured Zeroheight project URL</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>
                    Automatically finds all linked pages within the same domain
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>
                    Discovers both direct page links and navigation links
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                  <span>
                    Continues discovering new links as it processes each page
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Redirect Detection
              </h3>
              <p className="mb-4 text-slate-400">
                After navigating to each URL, the scraper detects redirects and
                normalizes URLs.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                  <span>
                    Checks the final destination URL after each navigation
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                  <span>
                    Detects when URLs redirect to other pages (common in
                    Zeroheight)
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                  <span>
                    Uses the final URL for storage instead of the original
                    redirecting URL
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Duplicate Prevention
              </h3>
              <p className="mb-4 text-slate-400">
                Maintains a set of processed URLs to avoid re-processing the
                same content multiple times.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    Maintains a set of processed URLs to avoid re-processing the
                    same content
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    When a redirect leads to an already processed page, skips
                    processing entirely
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    Progress counter only increments for actually processed
                    unique pages
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  <span>
                    Database storage uses upsert operations to handle any
                    remaining duplicates
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Link Discovery Limits
              </h3>
              <p className="mb-4 text-slate-400">
                When a page limit is set, the scraper stops discovering new
                links once the limit is reached.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                  <span>
                    When a page limit is set (e.g., limit: 3), stops discovering
                    new links once the limit is reached
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                  <span>
                    Prevents the processing queue from growing beyond the
                    specified number of pages
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                  <span>
                    Ensures predictable execution time and resource usage
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Console Output Example Section */}
        <section id="console-output" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            📋 Console Output Example
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
            <p className="mb-6 text-slate-400">
              Here&apos;s an example of the console output when running the
              scraper with a limit of 3 pages:
            </p>
            <div className="w-full overflow-x-auto">
              <div className="grid">
                <pre className="overflow-auto whitespace-pre text-slate-200 text-sm font-mono bg-slate-900 p-4 rounded-lg break-all">{`[dotenv@17.2.4] injecting env (5) from .env.local
Starting Zeroheight project scrape...
Navigating to https://example-design-system.zeroheight.com...
Password provided, checking for login form...
Found password input field, entering password...
Password entered, waiting for login to process...
Current URL after password entry: https://example-design-system.zeroheight.com/abc123def/p/example-project-home
Password input no longer visible - login appears successful
Found 23 navigation links after login attempt
Final URL after loading: https://example-design-system.zeroheight.com/abc123def/p/example-project-home
Page title: Example Design System
Content container found: true
Body text length: 51103 characters
Project URL: https://example-design-system.zeroheight.com
Allowed hostname: example-design-system.zeroheight.com
Found 29 total raw links on page
Sample raw links: https://example-design-system.zeroheight.com/abc123def/p/project-home, https://example-design-system.zeroheight.com/abc123def/n/components, ...
Found 0 links on main page
Found 0 Zeroheight page links (/p/ pattern)
Sample ZH page links:
Current page URL: https://example-design-system.zeroheight.com/abc123def/p/example-project-home
Total unique links to process: 1
[████████████████████] Processing page 1/3: https://example-design-system.zeroheight.com/abc123def/p/example-project-home
Discovered new link: https://example-design-system.zeroheight.com/abc123def/p/project-home
Discovered new link: https://example-design-system.zeroheight.com/abc123def/n/components
Discovered new link: https://example-design-system.zeroheight.com/abc123def/n/patterns
... (more discovered links)
Redirect detected: https://example-design-system.zeroheight.com/abc123def/p/project-home -> https://example-design-system.zeroheight.com/abc123def/p/example-project-home
Skipping https://example-design-system.zeroheight.com/abc123def/p/project-home - final URL https://example-design-system.zeroheight.com/abc123def/p/example-project-home already processed
Redirect detected: https://example-design-system.zeroheight.com/abc123def/n/components -> https://example-design-system.zeroheight.com/abc123def/p/component-library
[█████████████░░░░░░░] Processing page 2/3: https://example-design-system.zeroheight.com/abc123def/p/component-library
... (more processing output)
[████████████████████] Processing page 3/3: https://example-design-system.zeroheight.com/abc123def/p/design-tokens
Collected 3 pages for bulk insertion
Successfully inserted 3 pages
[██░░░░░░░░░░░░░░░░░░] Processing image 1/13: component-mockup-1.png
[███░░░░░░░░░░░░░░░░░] Processing image 2/13: design-token-example.png
... (image processing continues)
Successfully inserted 2 images
Scraping completed successfully`}</pre>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <h4 className="text-lg font-semibold text-white">
                Output Explanation
              </h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    🔐 Navigation & Authentication
                  </h5>
                  <p className="text-sm text-slate-400">
                    Shows login process and initial page loading
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    🔗 Link Discovery
                  </h5>
                  <p className="text-sm text-slate-400">
                    Lists newly discovered links as they&apos;re found
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    ↪️ Redirect Detection
                  </h5>
                  <p className="text-sm text-slate-400">
                    Identifies when URLs redirect and skips duplicates
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    📊 Progress Tracking
                  </h5>
                  <p className="text-sm text-slate-400">
                    Visual progress bars showing page processing status
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    🖼️ Image Processing
                  </h5>
                  <p className="text-sm text-slate-400">
                    Individual progress for each image being optimized and
                    uploaded
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 font-medium text-cyan-400">
                    ✅ Final Summary
                  </h5>
                  <p className="text-sm text-slate-400">
                    Reports total pages and images processed successfully
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="tools" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            MCP Tools
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {/* Scrape Zeroheight Project */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-900">
                  <svg
                    className="h-6 w-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Scrape Zeroheight Project
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Automatically discovers and scrapes all pages from your
                Zeroheight design system, including content and images. Uses
                upsert logic for safe re-running.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Scrape the Zeroheight design system&quot;
              </code>
            </div>

            {/* Query Zeroheight Data */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-900">
                  <svg
                    className="h-6 w-6 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Query Zeroheight Data
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Search and retrieve cached design system data with full-text
                search. Returns complete Supabase storage URLs for images.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Find pages about buttons&quot;
              </code>
            </div>

            {/* Clear Zeroheight Data */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-900">
                  <svg
                    className="h-6 w-6 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Clear Zeroheight Data
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Remove all cached Zeroheight data and images from the database.
                Requires explicit API key confirmation for safety.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Clear all cached Zeroheight data&quot;
              </code>
            </div>

            {/* Execute SQL */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-900">
                  <svg
                    className="h-6 w-6 text-yellow-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Execute SQL
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Execute raw SQL queries directly on the Supabase database for
                advanced data operations and analysis.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Run SQL query: SELECT COUNT(*) FROM pages&quot;
              </code>
            </div>

            {/* List Tables */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-900">
                  <svg
                    className="h-6 w-6 text-cyan-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  List Tables
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                List all tables in the database schemas to understand the data
                structure.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Show me all database tables&quot;
              </code>
            </div>

            {/* Get Database Schema */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-900">
                  <svg
                    className="h-6 w-6 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Get Database Schema
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Retrieve TypeScript type definitions for the complete database
                schema.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Get the database schema types&quot;
              </code>
            </div>

            {/* Get Project URL */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-900">
                  <svg
                    className="h-6 w-6 text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Get Project URL
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Retrieve the API URL for your Supabase project.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;What&apos;s the Supabase project URL?&quot;
              </code>
            </div>

            {/* Get Publishable API Keys */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-pink-900">
                  <svg
                    className="h-6 w-6 text-pink-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Get Publishable API Keys
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Get all publishable API keys for your project, including legacy
                anon keys and modern keys.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Show me the API keys&quot;
              </code>
            </div>

            {/* List Migrations */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-900">
                  <svg
                    className="h-6 w-6 text-orange-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  List Migrations
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                List all database migrations in chronological order.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;List all database migrations&quot;
              </code>
            </div>

            {/* Get Logs */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-900">
                  <svg
                    className="h-6 w-6 text-teal-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">Get Logs</h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Retrieve recent logs from the Supabase project database.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Show me the recent logs&quot;
              </code>
            </div>

            {/* Get Database Types */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-center">
                <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-violet-900">
                  <svg
                    className="h-6 w-6 text-violet-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Get Database Types
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Retrieve TypeScript type definitions for the database schema.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &quot;Get the database type definitions&quot;
              </code>
            </div>
          </div>
        </section>

        {/* Tech Stack Section */}
        <section id="tech" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            Technology Stack
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Backend & Infrastructure
              </h3>
              <ul className="space-y-2 text-slate-400">
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-blue-500"></span>
                  Next.js 16 with App Router
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-blue-500"></span>
                  TypeScript for type safety
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-blue-500"></span>
                  Supabase PostgreSQL database
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-blue-500"></span>
                  Supabase Storage for assets
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-blue-500"></span>
                  MCP (Model Context Protocol)
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Scraping & Processing
              </h3>
              <ul className="space-y-2 text-slate-400">
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-green-500"></span>
                  Puppeteer for web scraping
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-green-500"></span>
                  Intelligent link discovery
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-green-500"></span>
                  Bulk database operations
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-green-500"></span>
                  Progress tracking & logging
                </li>
                <li className="flex items-center">
                  <span className="mr-3 h-2 w-2 rounded-full bg-green-500"></span>
                  Image processing & storage
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Legal Compliance Section */}
        <section id="legal" className="grid gap-6 py-8">
          <h2 className="text-center text-3xl font-bold text-white">
            Terms & Conditions
          </h2>
          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-slate-300">
            <p>
              This Zeroheight MCP Server operates in full compliance with
              applicable laws and regulations. All data scraping and processing
              activities respect user privacy and data protection requirements.
            </p>
            <p>
              Zeroheight&apos;s{" "}
              <a
                href="https://terms.zeroheight.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 underline hover:text-cyan-300"
              >
                Terms of Service
              </a>{" "}
              do not prohibit scraping of projects where you maintain proper
              authentication and access permissions. This tool operates solely
              within the bounds of authorized access that you already possess.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-slate-700/50 p-4">
                <h4 className="mb-2 font-semibold text-white">
                  ✅ Authorized Access Only
                </h4>
                <p className="text-sm">
                  All operations require valid authentication and respect
                  existing access permissions.
                </p>
              </div>
              <div className="rounded-lg bg-slate-700/50 p-4">
                <h4 className="mb-2 font-semibold text-white">
                  ✅ Data Privacy
                </h4>
                <p className="text-sm">
                  No personal data collection or unauthorized data sharing
                  occurs.
                </p>
              </div>
              <div className="rounded-lg bg-slate-700/50 p-4">
                <h4 className="mb-2 font-semibold text-white">
                  ✅ Rate Limiting
                </h4>
                <p className="text-sm">
                  Built-in rate limiting prevents excessive API calls and server
                  strain.
                </p>
              </div>
              <div className="rounded-lg bg-slate-700/50 p-4">
                <h4 className="mb-2 font-semibold text-white">
                  ✅ Audit Trail
                </h4>
                <p className="text-sm">
                  All operations are logged for transparency and debugging
                  purposes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}

        <section className="py-8">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-8 text-center shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-white">
              Ready to enhance your design system workflow?
            </h2>
            <p className="mx-auto mb-6 max-w-2xl text-slate-400">
              Integrate Zeroheight MCP Server into your development pipeline and
              give your team programmatic access to design system documentation,
              components, and guidelines.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="/api/mcp"
                className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white transition-colors hover:bg-blue-700"
              >
                Try the API
              </Link>
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-600 px-8 py-3 font-medium text-slate-300 transition-colors hover:border-slate-500"
              >
                Learn about MCP
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-slate-700/50">
        <p className="text-slate-300 text-center">
          © Zeroheight MCP {new Date().getFullYear()}
        </p>
      </footer>
    </>
  );
}
