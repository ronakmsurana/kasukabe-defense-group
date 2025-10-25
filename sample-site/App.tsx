
import React from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { EmployeeProfile } from './components/EmployeeProfile';

const App: React.FC = () => {
  return (
    <HashRouter>
      <div className="min-h-screen text-gray-800 dark:text-gray-200">
        <header className="bg-white dark:bg-gray-800 shadow-md">
          <nav className="container mx-auto px-6 py-4">
            <Link to="/" className="text-2xl font-bold text-gray-800 dark:text-white">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-2 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                SecureCorp Directory
              </div>
            </Link>
          </nav>
        </header>
        <main className="container mx-auto p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<EmployeeDirectory />} />
            <Route path="/employee/:id" element={<EmployeeProfile />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
