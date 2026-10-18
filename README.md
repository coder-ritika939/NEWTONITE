# NEWTONITE — Work Management Dashboard

NEWTONITE is a web-based work management dashboard designed to help teams track work items, manage assignments, monitor urgent tasks, and handle approval workflows through a centralized interface.

## Features

- **Dashboard Overview:** View assigned tasks, unassigned urgent tasks, pending approvals, and total active work items.
- **Work Item Management:** View and manage work items from a centralized dashboard.
- **Task Assignment:** Claim available work items and track assigned tasks.
- **Urgency Tracking:** Identify urgent work items that have not yet been assigned.
- **Approval Workflow:** Track work items that are awaiting approval.
- **Persistent Storage:** Store application data using MySQL.
- **REST API:** Communicate between the React frontend and Express backend.

## Tech Stack

**Frontend**
- React.js
- Vite
- CSS

**Backend**
- Node.js
- Express.js

**Database**
- MySQL

## Project Structure

```text
NEWTONITE/
├── backend/
│   └── src/
│       ├── config/
│       ├── routes/
│       └── services/
├── frontend/
│   ├── src/
│   └── public/
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js and npm
- MySQL Server
- Git

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/coder-ritika939/NEWTONITE.git
cd NEWTONITE
```

### 2. Configure the Database

- Start MySQL Server.
- Create the database named `newtonite_ops`.
- Configure the database connection using the backend configuration or environment variables provided by the project.
- Ensure the required tables and initial data are available.

### 3. Start the Backend

Open a terminal in the project root and run:

```bash
cd backend
npm install
npm run dev
```

The backend runs at:

`http://localhost:5000`

### 4. Start the Frontend

Open a separate terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL displayed in the terminal, usually:

`http://localhost:5173`

## Dashboard Overview

The dashboard displays key work management metrics:

- Assigned to Me
- Unassigned Urgent
- Awaiting Approval
- Total Active Work Items

Users can claim available work items and view updated assignment information on the dashboard.

## Future Enhancements

- User authentication and role-based access control
- Advanced task filtering and search
- Work item creation and editing
- Notifications for urgent tasks and approvals
- Detailed reports and analytics

## Author

**Ritika Dwivedi**

GitHub: [coder-ritika939](https://github.com/coder-ritika939)

---

This project was developed as a work management dashboard application using React, Express.js, Node.js, and MySQL.
