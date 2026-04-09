# Kanban Task Board

A beautiful, fully-featured Kanban-style task board built with React and Supabase.

## Features

- **4-Column Kanban Board** — To Do, In Progress, In Review, Done
- **Drag & Drop** — Move tasks between columns with native HTML5 drag and drop
- **Guest Authentication** — Anonymous sign-in via Supabase Auth (no email needed)
- **Row Level Security** — Each user sees only their own tasks
- **Task Management** — Create, edit, delete tasks with title, description, priority, due date
- **Team Members & Assignees** — Create team members and assign them to tasks
- **Task Comments** — Add comments to tasks with chronological view
- **Activity Log** — Track status changes, creation, and comment activity
- **Labels / Tags** — Create custom labels and assign them to tasks
- **Due Date Indicators** — Visual badges for overdue and upcoming tasks
- **Search & Filtering** — Filter by title, priority, assignee, or label
- **Board Stats** — Total, completed, and overdue task counts

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Hosting**: Vercel
- **Styling**: Custom CSS with CSS Variables (dark theme, inspired by Linear)

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development

```bash
# Clone the repository
git clone https://github.com/Jubinshaikh/kanban-task-board.git
cd kanban-task-board

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment

The Supabase credentials (URL and anon key) are configured in `src/App.jsx`. These are public keys safe for frontend use.

## Database Schema

The app uses 6 tables in Supabase with RLS enabled on all:

- **tasks** — id, title, description, status, priority, due_date, position, user_id, assignee_id, created_at, updated_at
- **team_members** — id, name, color, avatar_url, user_id, created_at
- **labels** — id, name, color, user_id, created_at
- **task_labels** — id, task_id, label_id, user_id (junction table)
- **comments** — id, task_id, content, user_id, created_at
- **activity_log** — id, task_id, action, details (jsonb), user_id, created_at

All tables have RLS policies: `auth.uid() = user_id` for both read and write.

## Build

```bash
npm run build
```

Output will be in the `dist` folder, ready for deployment to Vercel.
