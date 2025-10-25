
import { Employee } from '../types';

const mockEmployees: Employee[] = [
  // 3 "decoy" employees
  { _id: 'decoy001', firstName: 'Admin', lastName: 'Backup', email: 'admin.backup@securecorp.dev', jobTitle: 'System Administrator', department: 'IT', is_decoy: true, avatar: 'https://i.pravatar.cc/150?u=decoy001' },
  { _id: 'decoy002', firstName: 'IT Security', lastName: 'Test', email: 'security.test@securecorp.dev', jobTitle: 'Security Analyst', department: 'IT', is_decoy: true, avatar: 'https://i.pravatar.cc/150?u=decoy002' },
  { _id: 'decoy003', firstName: 'CEO', lastName: 'Temp', email: 'ceo.temp@securecorp.dev', jobTitle: 'Interim CEO', department: 'Executive', is_decoy: true, avatar: 'https://i.pravatar.cc/150?u=decoy003' },

  // 20 "real" employees
  { _id: 'emp001', firstName: 'Alice', lastName: 'Johnson', email: 'alice.j@securecorp.dev', jobTitle: 'Software Engineer', department: 'Engineering', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp001' },
  { _id: 'emp002', firstName: 'Bob', lastName: 'Smith', email: 'bob.s@securecorp.dev', jobTitle: 'Product Manager', department: 'Product', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp002' },
  { _id: 'emp003', firstName: 'Charlie', lastName: 'Brown', email: 'charlie.b@securecorp.dev', jobTitle: 'UI/UX Designer', department: 'Design', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp003' },
  { _id: 'emp004', firstName: 'Diana', lastName: 'Prince', email: 'diana.p@securecorp.dev', jobTitle: 'HR Manager', department: 'Human Resources', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp004' },
  { _id: 'emp005', firstName: 'Ethan', lastName: 'Hunt', email: 'ethan.h@securecorp.dev', jobTitle: 'Marketing Specialist', department: 'Marketing', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp005' },
  { _id: 'emp006', firstName: 'Fiona', lastName: 'Glenanne', email: 'fiona.g@securecorp.dev', jobTitle: 'QA Engineer', department: 'Engineering', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp006' },
  { _id: 'emp007', firstName: 'George', lastName: 'Lucas', email: 'george.l@securecorp.dev', jobTitle: 'DevOps Engineer', department: 'IT', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp007' },
  { _id: 'emp008', firstName: 'Hannah', lastName: 'Montana', email: 'hannah.m@securecorp.dev', jobTitle: 'Content Strategist', department: 'Marketing', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp008' },
  { _id: 'emp009', firstName: 'Ian', lastName: 'Malcolm', email: 'ian.m@securecorp.dev', jobTitle: 'Data Scientist', department: 'Data Science', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp009' },
  { _id: 'emp010', firstName: 'Jane', lastName: 'Doe', email: 'jane.d@securecorp.dev', jobTitle: 'Frontend Developer', department: 'Engineering', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp010' },
  { _id: 'emp011', firstName: 'Kyle', lastName: 'Reese', email: 'kyle.r@securecorp.dev', jobTitle: 'Backend Developer', department: 'Engineering', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp011' },
  { _id: 'emp012', firstName: 'Laura', lastName: 'Croft', email: 'laura.c@securecorp.dev', jobTitle: 'Project Manager', department: 'Product', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp012' },
  { _id: 'emp013', firstName: 'Michael', lastName: 'Scott', email: 'michael.s@securecorp.dev', jobTitle: 'Sales Representative', department: 'Sales', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp013' },
  { _id: 'emp014', firstName: 'Nancy', lastName: 'Drew', email: 'nancy.d@securecorp.dev', jobTitle: 'Financial Analyst', department: 'Finance', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp014' },
  { _id: 'emp015', firstName: 'Oscar', lastName: 'Martinez', email: 'oscar.m@securecorp.dev', jobTitle: 'Accountant', department: 'Finance', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp015' },
  { _id: 'emp016', firstName: 'Pam', lastName: 'Beesly', email: 'pam.b@securecorp.dev', jobTitle: 'Office Manager', department: 'Administration', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp016' },
  { _id: 'emp017', firstName: 'Quentin', lastName: 'Tarantino', email: 'quentin.t@securecorp.dev', jobTitle: 'Creative Director', department: 'Design', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp017' },
  { _id: 'emp018', firstName: 'Rachel', lastName: 'Green', email: 'rachel.g@securecorp.dev', jobTitle: 'Customer Support', department: 'Sales', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp018' },
  { _id: 'emp019', firstName: 'Steve', lastName: 'Rogers', email: 'steve.r@securecorp.dev', jobTitle: 'Chief Technical Officer', department: 'Executive', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp019' },
  { _id: 'emp020', firstName: 'Tony', lastName: 'Stark', email: 'tony.s@securecorp.dev', jobTitle: 'Chief Executive Officer', department: 'Executive', is_decoy: false, avatar: 'https://i.pravatar.cc/150?u=emp020' },
];

/**
 * Mimics GET /api/employees
 * Fetches all employees but filters out decoys.
 */
export const getEmployees = async (): Promise<Employee[]> => {
  console.log("Fetching all non-decoy employees...");
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockEmployees.filter(emp => !emp.is_decoy));
    }, 500);
  });
};

/**
 * Mimics GET /api/employees/:id
 * Fetches a single employee by their ID, without filtering.
 */
export const getEmployeeById = async (id: string): Promise<Employee | undefined> => {
  console.log(`Fetching employee with ID: ${id}...`);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockEmployees.find(emp => emp._id === id));
    }, 300);
  });
};
