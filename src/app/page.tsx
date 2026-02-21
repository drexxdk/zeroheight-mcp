"use client";

import Link from "next/link";
import { useEffect, useState, type ReactElement } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { SectionHeader, FeatureCard, ToolCard, InfoCard } from "./components";
import {
  FaBolt,
  FaMagnifyingGlass,
  FaDatabase,
  FaImage,
  FaLock,
  FaGlobe,
  FaTrash,
  FaFileLines,
  FaBook,
  FaLink,
  FaKey,
  FaList,
  FaTerminal,
  FaCamera,
  FaRuler,
  FaArrowRight,
  FaChartBar,
  FaCheck,
  FaGithub,
} from "react-icons/fa6";

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

// eslint-disable-next-line max-lines-per-function, complexity
export default function Home(): ReactElement {
  const [activeSection, setActiveSection] = useState("features");
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = (): void => {
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

      // Calculate scroll progress
      const totalHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
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

  const scrollToSection = (sectionId: string): void => {
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
        {/* Scroll Progress Bar */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-cyan-500 to-blue-500 origin-left"
          style={{ scaleX: scrollProgress / 100 }}
          transition={{ duration: 0.1 }}
        />

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
      <motion.section
        className="relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <motion.div
          className="absolute inset-0 bg-linear-to-br from-slate-900 via-blue-900/30 to-purple-900/40"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        ></motion.div>
        <div className="absolute inset-0 bg-linear-to-r from-blue-600/10 via-transparent to-purple-600/10"></div>
        <motion.div
          className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        ></motion.div>
        <motion.div
          className="absolute right-1/4 bottom-0 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        ></motion.div>

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8">
          <div className="text-center">
            <motion.h1
              className="mb-6 text-5xl leading-tight font-bold text-white md:text-7xl"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Zeroheight Design System
              <motion.span
                className="block bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent"
                animate={{
                  backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                MCP Server
              </motion.span>
            </motion.h1>
            <motion.p
              className="mx-auto mb-12 max-w-4xl text-xl leading-relaxed text-slate-300 md:text-2xl"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              A powerful Model Context Protocol server that scrapes, indexes,
              and provides intelligent querying capabilities for Zeroheight
              design system documentation. Built for design systems teams who
              need programmatic access to their component libraries and design
              guidelines.
            </motion.p>
            <motion.div
              className="flex flex-col justify-center gap-6 sm:flex-row"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  href="#tools"
                  className="transform rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 px-10 py-4 text-lg font-semibold text-white shadow-2xl transition-all duration-300 hover:from-cyan-600 hover:to-blue-700 hover:shadow-cyan-500/25 flex items-center"
                >
                  Get Started
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <a
                  href="https://github.com/drexxdk/zeroheight-mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border-2 border-slate-400 bg-slate-800/30 px-10 py-4 text-lg font-semibold text-slate-300 backdrop-blur-sm transition-all duration-300 hover:border-cyan-400 hover:bg-slate-700/50 hover:text-white flex items-center gap-2"
                >
                  <FaGithub className="h-5 w-5" />
                  View on GitHub
                </a>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Main Content */}
      <main className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {/* Features Section */}
        <motion.section
          id="features"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Key Features</SectionHeader>
          <motion.div
            className="grid gap-8 md:grid-cols-2 lg:grid-cols-3"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05,
                },
              },
            }}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaBolt />}
                title="Intelligent Scraping"
                description="Automatically discovers and scrapes all pages, components, and documentation from your Zeroheight design system with smart link following and content extraction."
                iconColor="green"
                className="h-full"
              />
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaMagnifyingGlass />}
                title="Powerful Search"
                description="Query your design system data with full-text search across titles, content, and URLs. Find components, patterns, and guidelines instantly."
                iconColor="blue"
                className="h-full"
              />
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaDatabase />}
                title="MCP Integration"
                description="Built on the Model Context Protocol for seamless integration with AI assistants, design tools, and development workflows."
                iconColor="purple"
                className="h-full"
              />
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaImage />}
                title="Image Management"
                description="Automatically downloads, processes, and stores design system images and assets with optimized storage and fast retrieval."
                iconColor="orange"
                className="h-full"
              />
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaLock />}
                title="Secure Access"
                description="Enterprise-grade authentication with API key validation and secure access controls for your design system data."
                iconColor="red"
                className="h-full"
              />
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              className="h-full"
            >
              <FeatureCard
                icon={<FaBolt />}
                title="High Performance"
                description="Optimized for speed with bulk database operations, progress tracking, and efficient caching for large design systems."
                iconColor="indigo"
                className="h-full"
              />
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Image Management Section */}
        <motion.section
          id="image-management"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Image Management</SectionHeader>
          <motion.div
            className="grid gap-8 md:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Supported Image Types" className="h-full">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 font-medium text-green-400 flex items-center gap-2">
                      <FaCheck className="text-green-400" />
                      Supported
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-400">
                      <li>• PNG - Portable Network Graphics</li>
                      <li>• JPG/JPEG - Joint Photographic Experts Group</li>
                      <li>• WebP - Modern web image format</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 font-medium text-red-400 flex items-center gap-2">
                      <FaTrash className="text-red-400" />
                      Filtered Out
                    </h4>
                    <ul className="space-y-1 text-sm text-slate-400">
                      <li>• GIF - Graphics Interchange Format</li>
                      <li>• SVG - Scalable Vector Graphics</li>
                    </ul>
                  </div>
                </div>
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Upload Process" className="h-full">
                <p className="mb-4 text-slate-400">
                  Images are automatically downloaded from Zeroheight and
                  uploaded to Supabase Storage buckets with intelligent
                  deduplication.
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
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Duplicate Prevention" className="h-full">
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
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Image Optimization" className="h-full">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center">
                    <div className="mb-2 flex justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600">
                        <FaCamera className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <h4 className="mb-1 font-medium text-cyan-400">
                      Format Conversion
                    </h4>
                    <p className="text-sm text-slate-400">
                      All images converted to JPEG format
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="mb-2 flex justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600">
                        <FaBolt className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <h4 className="mb-1 font-medium text-cyan-400">
                      Quality Reduction
                    </h4>
                    <p className="text-sm text-slate-400">
                      Reduced to 80% quality
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="mb-2 flex justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600">
                        <FaRuler className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <h4 className="mb-1 font-medium text-cyan-400">
                      Resolution Limiting
                    </h4>
                    <p className="text-sm text-slate-400">
                      Max 1920px on longest side
                    </p>
                  </div>
                </div>
              </InfoCard>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Page Discovery Section */}
        <motion.section
          id="page-discovery"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Page Discovery and Redirect Handling</SectionHeader>
          <motion.div
            className="grid gap-8 md:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Page Discovery" className="h-full">
                <p className="mb-4 text-slate-400">
                  The scraper intelligently discovers and processes pages while
                  maintaining efficiency.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start">
                    <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    <span>
                      Starts with the configured Zeroheight project URL
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    <span>
                      Automatically finds all linked pages within the same
                      domain
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
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Redirect Detection" className="h-full">
                <p className="mb-4 text-slate-400">
                  After navigating to each URL, the scraper detects redirects
                  and normalizes URLs.
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
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Duplicate Prevention" className="h-full">
                <p className="mb-4 text-slate-400">
                  Maintains a set of processed URLs to avoid re-processing the
                  same content multiple times.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start">
                    <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    <span>
                      Maintains a set of processed URLs to avoid re-processing
                      the same content
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
              </InfoCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <InfoCard title="Link Discovery Limits" className="h-full">
                <p className="mb-4 text-slate-400">
                  When a page limit is set, the scraper stops discovering new
                  links once the limit is reached.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start">
                    <span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                    <span>
                      When a page limit is set (e.g., limit: 3), stops
                      discovering new links once the limit is reached
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
              </InfoCard>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Console Output Example Section */}
        <motion.section
          id="console-output"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Console Output Example</SectionHeader>
          <motion.div
            className="rounded-xl border border-slate-700 bg-slate-800 p-6"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <p className="mb-6 text-slate-400">
              Here&apos;s an example of the console output when running the
              scraper:
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
            <motion.div
              className="mt-6 space-y-4"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <h4 className="text-lg font-semibold text-white">
                Output Explanation
              </h4>
              <motion.div
                className="grid gap-3 md:grid-cols-2"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                viewport={{ once: true }}
              >
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaLock className="text-cyan-400" />
                    Navigation & Authentication
                  </h5>
                  <p className="text-sm text-slate-400">
                    Shows login process and initial page loading
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaLink className="text-cyan-400" />
                    Link Discovery
                  </h5>
                  <p className="text-sm text-slate-400">
                    Lists newly discovered links as they&apos;re found
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaArrowRight className="text-cyan-400" />
                    Redirect Detection
                  </h5>
                  <p className="text-sm text-slate-400">
                    Identifies when URLs redirect and skips duplicates
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaChartBar className="text-cyan-400" />
                    Progress Tracking
                  </h5>
                  <p className="text-sm text-slate-400">
                    Visual progress bars showing page processing status
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaImage className="text-cyan-400" />
                    Image Processing
                  </h5>
                  <p className="text-sm text-slate-400">
                    Individual progress for each image being optimized and
                    uploaded
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  viewport={{ once: true }}
                >
                  <h5 className="mb-2 font-medium text-cyan-400 flex items-center gap-2">
                    <FaCheck className="text-cyan-400" />
                    Final Summary
                  </h5>
                  <p className="text-sm text-slate-400">
                    Reports total pages and images processed successfully
                  </p>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.section>
        <motion.section
          id="tools"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>MCP Tools</SectionHeader>
          <motion.div
            className="grid gap-8 md:grid-cols-2 lg:grid-cols-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaGlobe />}
                title="Scrape Zeroheight Project"
                description="Automatically discovers and scrapes all pages from your Zeroheight design system, including content and images. Uses upsert logic for safe re-running without clearing existing data."
                codeExample='"Scrape the Zeroheight design system"'
                iconColor="blue"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.07 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaMagnifyingGlass />}
                title="Query Zeroheight Data"
                description="Search and retrieve cached design system data with full-text search. Returns complete Supabase storage URLs for images."
                codeExample='"Find pages about buttons"'
                iconColor="green"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.09 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaTrash />}
                title="Clear Zeroheight Data"
                description="Remove all cached Zeroheight data and images from the database. Requires explicit API key confirmation for safety."
                codeExample='"Clear all cached Zeroheight data"'
                iconColor="red"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.11 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaFileLines />}
                title="Execute SQL"
                description="Execute raw SQL queries directly on the Supabase database for advanced data operations and analysis."
                codeExample='"Run SQL query: SELECT COUNT(*) FROM pages"'
                iconColor="yellow"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.13 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaDatabase />}
                title="List Tables"
                description="List all tables in the database schemas to understand the data structure."
                codeExample='"Show me all database tables"'
                iconColor="cyan"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaBook />}
                title="Get Database Schema"
                description="Retrieve TypeScript type definitions for the complete database schema."
                codeExample='"Get the database schema types"'
                iconColor="purple"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.17 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaLink />}
                title="Get Project URL"
                description="Retrieve the API URL for your Supabase project."
                codeExample='"What&apos;s the Supabase project URL?"'
                iconColor="indigo"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.19 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaKey />}
                title="Get Publishable API Keys"
                description="Get all publishable API keys for your project, including legacy anon keys and modern keys."
                codeExample='"Show me the API keys"'
                iconColor="pink"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.21 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaList />}
                title="List Migrations"
                description="List all database migrations in chronological order."
                codeExample='"List all database migrations"'
                iconColor="orange"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.23 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaTerminal />}
                title="Get Logs"
                description="Retrieve recent logs from the Supabase project database."
                codeExample='"Show me the recent logs"'
                iconColor="teal"
                className="h-full"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              viewport={{ once: true }}
              className="h-full"
            >
              <ToolCard
                icon={<FaBook />}
                title="Get Database Types"
                description="Retrieve TypeScript type definitions for the database schema."
                codeExample='"Get the database type definitions"'
                iconColor="violet"
                className="h-full"
              />
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Tech Stack Section */}
        <motion.section
          id="tech"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Technology Stack</SectionHeader>
          <motion.div
            className="grid gap-8 md:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <motion.div
              className="h-full rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              viewport={{ once: true }}
            >
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
            </motion.div>

            <motion.div
              className="h-full rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              viewport={{ once: true }}
            >
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
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Legal Compliance Section */}
        <motion.section
          id="legal"
          className="grid gap-6 py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <SectionHeader>Terms & Conditions</SectionHeader>
          <motion.div
            className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-slate-300"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            viewport={{ once: true }}
          >
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
            <motion.div
              className="grid gap-4 md:grid-cols-2"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <motion.div
                className="rounded-lg bg-slate-700/50 p-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                viewport={{ once: true }}
              >
                <h4 className="mb-2 font-semibold text-white flex items-center gap-2">
                  <FaCheck className="text-green-400" />
                  Authorized Access Only
                </h4>
                <p className="text-sm">
                  All operations require valid authentication and respect
                  existing access permissions.
                </p>
              </motion.div>
              <motion.div
                className="rounded-lg bg-slate-700/50 p-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                viewport={{ once: true }}
              >
                <h4 className="mb-2 font-semibold text-white flex items-center gap-2">
                  <FaCheck className="text-green-400" />
                  Data Privacy
                </h4>
                <p className="text-sm">
                  No personal data collection or unauthorized data sharing
                  occurs.
                </p>
              </motion.div>
              <motion.div
                className="rounded-lg bg-slate-700/50 p-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                viewport={{ once: true }}
              >
                <h4 className="mb-2 font-semibold text-white flex items-center gap-2">
                  <FaCheck className="text-green-400" />
                  Rate Limiting
                </h4>
                <p className="text-sm">
                  Built-in rate limiting prevents excessive API calls and server
                  strain.
                </p>
              </motion.div>
              <motion.div
                className="rounded-lg bg-slate-700/50 p-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <h4 className="mb-2 font-semibold text-white flex items-center gap-2">
                  <FaCheck className="text-green-400" />
                  Audit Trail
                </h4>
                <p className="text-sm">
                  All operations are logged for transparency and debugging
                  purposes.
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* CTA Section */}

        <motion.section
          className="py-8"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true }}
        >
          <motion.div
            className="rounded-xl border border-slate-700 bg-slate-800 p-8 text-center shadow-sm"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.3 }}
          >
            <motion.h2
              className="mb-4 text-2xl font-bold text-white"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              viewport={{ once: true }}
            >
              Ready to enhance your design system workflow?
            </motion.h2>
            <motion.p
              className="mx-auto mb-6 max-w-2xl text-slate-400"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              viewport={{ once: true }}
            >
              Integrate Zeroheight MCP Server into your development pipeline and
              give your team programmatic access to design system documentation,
              components, and guidelines.
            </motion.p>
            <motion.div
              className="flex flex-col justify-center gap-4 sm:flex-row"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  href="/api/mcp"
                  className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white transition-colors hover:bg-blue-700 flex items-center"
                >
                  Try the API
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <a
                  href="https://modelcontextprotocol.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-600 px-8 py-3 font-medium text-slate-300 transition-colors hover:border-slate-500 flex items-center"
                >
                  Learn about MCP
                </a>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.section>
      </main>

      {/* Back to Top Button */}
      <motion.button
        className="fixed bottom-8 right-8 z-40 rounded-full bg-cyan-600 p-3 text-white shadow-lg transition-colors hover:bg-cyan-700"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: scrollProgress > 20 ? 1 : 0,
          scale: scrollProgress > 20 ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <FaArrowRight className="h-5 w-5 -rotate-90" />
      </motion.button>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-slate-700/50">
        <p className="text-slate-300 text-center">
          © Zeroheight MCP {new Date().getFullYear()}
        </p>
      </footer>
    </>
  );
}
