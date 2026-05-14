import { Router } from 'express';
import taskColumnsRoutes from './routes/task-columns.routes';
import projectTasksRoutes from './routes/project-tasks.routes';
import taskTemplatesRoutes from './routes/task-templates.routes';
import taskDashboardRoutes from './routes/task-dashboard.routes';

export function createTasksRoutes(): Router {
  const router = Router();

  // /task-dashboard
  router.use('/task-dashboard', taskDashboardRoutes);

  // /projects/:projectId/task-columns
  router.use('/projects/:projectId/task-columns', taskColumnsRoutes);

  // /projects/:projectId/tasks
  router.use('/projects/:projectId/tasks', projectTasksRoutes);

  // /task-templates
  router.use('/task-templates', taskTemplatesRoutes);

  return router;
}
