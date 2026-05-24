import { Router } from 'express';
import { handleNotification } from '../teams-subscription';

const router = Router();

/** Teams Change Notification receiver — no auth required (called by Microsoft Graph) */
router.post('/teams', (req, res) => {
  // Subscription validation challenge: echo validationToken as text/plain within 3s
  const { validationToken } = req.query as { validationToken?: string };
  if (validationToken) {
    return res.status(200).contentType('text/plain').send(validationToken);
  }

  // Acknowledge immediately before processing (MS Graph requires response within 3s)
  res.status(202).send();

  const notifications: any[] = req.body?.value ?? [];
  for (const notif of notifications) {
    handleNotification(notif.subscriptionId ?? '', notif.resourceData ?? {});
  }
});

export default router;
