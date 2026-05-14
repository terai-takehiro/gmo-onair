import { Router } from 'express';
import taskColumnsRoutes from './routes/task-columns.routes';
import projectTasksRoutes from './routes/project-tasks.routes';
import taskTemplatesRoutes from './routes/task-templates.routes';

export function createTasksRoutes(): Router {
  const router = Router();

  // /projects/:projectId/task-columns
  router.use('/projects/:projectId/task-columns', taskColumnsRoutes);

  // /projects/:projectId/tasks
  router.use('/projects/:projectId/tasks', projectTasksRoutes);

  // /task-templates
  router.use('/task-templates', taskTemplatesRoutes);

  return router;
}
