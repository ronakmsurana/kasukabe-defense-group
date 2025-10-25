
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEmployeeById } from '../services/employeeService';
import { Employee } from '../types';
import { Spinner } from './Spinner';

export const EmployeeProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchEmployee = async () => {
      try {
        setLoading(true);
        const data = await getEmployeeById(id);
        if (data) {
          setEmployee(data);
        } else {
          setError('Employee not found.');
        }
      } catch (err) {
        setError('Failed to fetch employee data.');
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [id]);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
        <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-red-500 mb-4">{error}</h2>
            <Link to="/" className="text-indigo-500 hover:underline">
                &larr; Back to Directory
            </Link>
        </div>
    );
  }

  if (!employee) {
    return null; // Should be handled by error state
  }

  return (
    <div>
      <Link to="/" className="inline-block mb-6 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 transition">
        &larr; Back to Directory
      </Link>
      
      {employee.is_decoy && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
          <p className="font-bold">Security Warning</p>
          <p>This is a decoy account used for security monitoring purposes. Access is logged.</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-8">
            <img
              className="w-32 h-32 rounded-full border-4 border-indigo-200 dark:border-indigo-800"
              src={employee.avatar}
              alt={`${employee.firstName} ${employee.lastName}`}
            />
            <div className="text-center sm:text-left">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {employee.firstName} {employee.lastName}
              </h1>
              <p className="text-xl text-indigo-500 dark:text-indigo-400">{employee.jobTitle}</p>
              <p className="text-md text-gray-600 dark:text-gray-400">{employee.department} Department</p>
            </div>
          </div>
          
          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Contact Information</h3>
            <div className="flex items-center text-gray-600 dark:text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <a href={`mailto:${employee.email}`} className="hover:underline">{employee.email}</a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
