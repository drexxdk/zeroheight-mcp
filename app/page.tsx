import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">ZH</span>
              </div>
              <h1 className="text-xl font-bold text-white">
                ZeroHeight MCP
              </h1>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="#features" className="text-slate-400 hover:text-white transition-colors">
                Features
              </a>
              <a href="#api" className="text-slate-400 hover:text-white transition-colors">
                API
              </a>
              <a href="#tech" className="text-slate-400 hover:text-white transition-colors">
                Tech Stack
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section - Full Width */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/30 to-purple-900/40"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-purple-600/10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Zeroheight Design System
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 animate-pulse">
                MCP Server
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto mb-12 leading-relaxed">
              A powerful Model Context Protocol server that scrapes, indexes, and provides intelligent querying capabilities for Zeroheight design system documentation. Built for design systems teams who need programmatic access to their component libraries and design guidelines.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Link
                href="#api"
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-cyan-500/25"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/drexxdk/zeroheight-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="border-2 border-slate-400 hover:border-cyan-400 text-slate-300 hover:text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-300 backdrop-blur-sm bg-slate-800/30 hover:bg-slate-700/50"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Features Section */}
        <section id="features" className="mb-20">
          <h2 className="text-3xl font-bold text-center text-white mb-12">
            Key Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-green-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Intelligent Scraping
                </h3>
              </div>
              <p className="text-slate-400">
                Automatically discovers and scrapes all pages, components, and documentation from your ZeroHeight design system with smart link following and content extraction.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Powerful Search
                </h3>
              </div>
              <p className="text-slate-400">
                Query your design system data with full-text search across titles, content, and URLs. Find components, patterns, and guidelines instantly.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-purple-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  MCP Integration
                </h3>
              </div>
              <p className="text-slate-400">
                Built on the Model Context Protocol for seamless integration with AI assistants, design tools, and development workflows.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-orange-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Image Management
                </h3>
              </div>
              <p className="text-slate-400">
                Automatically downloads, processes, and stores design system images and assets with optimized storage and fast retrieval.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Secure Access
                </h3>
              </div>
              <p className="text-slate-400">
                Enterprise-grade authentication with API key validation and secure access controls for your design system data.
              </p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-indigo-900 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  High Performance
                </h3>
              </div>
              <p className="text-slate-400">
                Optimized for speed with bulk database operations, progress tracking, and efficient caching for large design systems.
              </p>
            </div>
          </div>
        </section>

        {/* API Section */}
        <section id="api" className="mb-20">
          <h2 className="text-3xl font-bold text-center text-white mb-12">
            API Endpoints
          </h2>
          <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Scrape Zeroheight Project
                </h3>
                <p className="text-slate-400 mb-3">
                  Performs a fresh scrape of your configured Zeroheight design system.
                </p>
                <code className="block bg-slate-700 p-3 rounded text-sm text-slate-200">
                  POST /api/mcp<br/>
                  {"{"}<br/>
                  {"  "}&quot;jsonrpc&quot;: &quot;2.0&quot;,<br/>
                  {"  "}&quot;method&quot;: &quot;tools/call&quot;,<br/>
                  {"  "}&quot;params&quot;: {"{"}&quot;name&quot;: &quot;Scrape Zeroheight Project&quot;{"}"}<br/>
                  {"}"}
                </code>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Query Zeroheight Data
                </h3>
                <p className="text-slate-400 mb-3">
                  Search and retrieve design system data with full-text search capabilities.
                </p>
                <code className="block bg-slate-700 p-3 rounded text-sm text-slate-200">
                  POST /api/mcp<br/>
                  {"{"}<br/>
                  {"  "}&quot;jsonrpc&quot;: &quot;2.0&quot;,<br/>
                  {"  "}&quot;method&quot;: &quot;tools/call&quot;,<br/>
                  {"  "}&quot;params&quot;: {"{"}<br/>
                  {"    "}&quot;name&quot;: &quot;Query Zeroheight Data&quot;,<br/>
                  {"    "}&quot;arguments&quot;: {"{"}&quot;search&quot;: &quot;button component&quot;{"}"}<br/>
                  {"  "}{"}"}<br/>
                  {"}"}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* Tech Stack Section */}
        <section id="tech" className="mb-20">
          <h2 className="text-3xl font-bold text-center text-white mb-12">
            Technology Stack
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Backend & Infrastructure
              </h3>
              <ul className="space-y-2 text-slate-400">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  Next.js 16 with App Router
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  TypeScript for type safety
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  Supabase PostgreSQL database
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  Supabase Storage for assets
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  MCP (Model Context Protocol)
                </li>
              </ul>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Scraping & Processing
              </h3>
              <ul className="space-y-2 text-slate-400">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Puppeteer for web scraping
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Intelligent link discovery
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Bulk database operations
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Progress tracking & logging
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Image processing & storage
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to enhance your design system workflow?
          </h2>
          <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
            Integrate ZeroHeight MCP Server into your development pipeline and give your team programmatic access to design system documentation, components, and guidelines.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/api/mcp"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
            >
              Try the API
            </Link>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-slate-600 hover:border-slate-500 text-slate-300 px-8 py-3 rounded-lg font-medium transition-colors"
            >
              Learn about MCP
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 backdrop-blur-sm mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-slate-400">
            <p>Built with Next.js, TypeScript, and the Model Context Protocol</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
