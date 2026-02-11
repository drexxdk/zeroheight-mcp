"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [activeSection, setActiveSection] = useState("features");

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

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["features", "tools", "tech", "legal"];
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

  return (
    <div className="min-h-screen scroll-smooth bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-sm font-bold text-white">ZH</span>
              </div>
              <h1 className="text-xl font-bold text-white">ZeroHeight MCP</h1>
            </div>
            <nav className="hidden space-x-8 md:flex">
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
                documentation from your ZeroHeight design system with smart link
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

        {/* Tools Section */}
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
                Performs a fresh scrape of your configured Zeroheight design
                system and caches all pages, components, and documentation.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;Scrape Zeroheight
                Project&quot;&rbrace;
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
                Search and retrieve design system data with full-text search
                across titles, content, and URLs.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;Query Zeroheight Data&quot;,
                &quot;arguments&quot;: &lbrace;&quot;search&quot;:
                &quot;...&quot;&rbrace;&rbrace;
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
                Execute raw SQL queries directly on the database for advanced
                data operations.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;Execute SQL&quot;,
                &quot;arguments&quot;: &lbrace;&quot;query&quot;: &quot;SELECT
                ...&quot;&rbrace;&rbrace;
              </code>
            </div>

            {/* Generate TypeScript Types */}
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
                  Generate TypeScript Types
                </h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Generate TypeScript type definitions for your database schema.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;Generate TypeScript
                Types&quot;&rbrace;
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
                &lbrace;&quot;name&quot;: &quot;Get Project URL&quot;&rbrace;
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
                &lbrace;&quot;name&quot;: &quot;Get Publishable API
                Keys&quot;&rbrace;
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
                List all tables in one or more database schemas.
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;List Tables&quot;,
                &quot;arguments&quot;: &lbrace;&quot;schemas&quot;:
                [&quot;public&quot;]&rbrace;&rbrace;
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
                &lbrace;&quot;name&quot;: &quot;List Migrations&quot;&rbrace;
              </code>
            </div>

            {/* Get Logs */}
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">Get Logs</h3>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Retrieve logs for your Supabase project by service type (API,
                database, auth, etc.).
              </p>
              <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
                &lbrace;&quot;name&quot;: &quot;Get Logs&quot;,
                &quot;arguments&quot;: &lbrace;&quot;service&quot;:
                &quot;api&quot;&rbrace;&rbrace;
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
              This ZeroHeight MCP Server operates in full compliance with
              applicable laws and regulations. All data scraping and processing
              activities respect user privacy and data protection requirements.
            </p>
            <p>
              ZeroHeight&apos;s{" "}
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
              Integrate ZeroHeight MCP Server into your development pipeline and
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
        <div className="flex items-center justify-center space-x-3 text-sm leading-relaxed font-medium text-slate-300">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">ZH</span>
          </div>
          <span>
            © Zeroheight MCP {new Date().getFullYear()}. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
