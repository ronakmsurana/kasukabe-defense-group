
import React from 'react';
import { Link } from 'react-router-dom';
import { Employee } from '../types';

interface EmployeeCardProps {
  employee: Employee;
}

export const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee }) => {
  return (
    <Link 
      to={`/employee/${employee._id}`} 
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden group"
    >
      <div className="p-5 text-center">
        <img
          className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-200 dark:border-gray-700 group-hover:border-indigo-500 transition-colors"
          src={employee.avatar}
          alt={`${employee.firstName} ${employee.lastName}`}
        />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {employee.firstName} {employee.lastName}
        </h3>
        <p className="text-gray-500 dark:text-gray-400">{employee.jobTitle}</p>
      </div>
    </Link>
  );
};
