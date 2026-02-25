/**
 * Subscription Routes
 * User subscription and billing management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/subscription
 * Get current subscription
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();

    let subscription = db.prepare(`
      SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'
    `).get(req.user.id);

    // Return default free plan if no subscription
    if (!subscription) {
      subscription = {
        id: null,
        user_id: req.user.id,
        plan: 'free',
        status: 'active',
        agent_slots: 2,
        features: JSON.stringify({
          maxAgents: 2,
          maxConversations: 100,
          maxMessagesPerMonth: 1000,
          platforms: ['whatsapp'],
          aiModels: ['gpt-3.5-turbo']
        }),
        created_at: new Date().toISOString()
      };
    }

    res.json({
      subscription: {
        ...subscription,
        features: subscription.features ? JSON.parse(subscription.features) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to get subscription: ${error.message}`);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

/**
 * POST /api/subscription/checkout
 * Create Stripe checkout session
 */
router.post('/checkout', async (req, res) => {
  try {
    const { planId, successUrl, cancelUrl } = req.body;

    // TODO: Implement actual Stripe checkout
    res.json({
      checkoutUrl: successUrl || '/',
      sessionId: uuidv4()
    });

  } catch (error) {
    logger.error(`Failed to create checkout: ${error.message}`);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel subscription
 */
router.post('/cancel', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare(`
      UPDATE subscriptions SET status = 'cancelled', cancelled_at = datetime('now')
      WHERE user_id = ? AND status = 'active'
    `).run(req.user.id);

    res.json({ message: 'Subscription cancelled' });

  } catch (error) {
    logger.error(`Failed to cancel subscription: ${error.message}`);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/subscription/resume
 * Resume cancelled subscription
 */
router.post('/resume', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare(`
      UPDATE subscriptions SET status = 'active', cancelled_at = NULL
      WHERE user_id = ? AND status = 'cancelled'
    `).run(req.user.id);

    res.json({ message: 'Subscription resumed' });

  } catch (error) {
    logger.error(`Failed to resume subscription: ${error.message}`);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * POST /api/subscription/add-agent-slot
 * Add agent slots
 */
router.post('/add-agent-slot', (req, res) => {
  try {
    const { quantity = 1 } = req.body;
    const db = getDatabase();

    db.prepare(`
      UPDATE subscriptions SET agent_slots = agent_slots + ?
      WHERE user_id = ? AND status = 'active'
    `).run(quantity, req.user.id);

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);

    res.json({
      agentSlots: subscription?.agent_slots || 2
    });

  } catch (error) {
    logger.error(`Failed to add agent slot: ${error.message}`);
    res.status(500).json({ error: 'Failed to add agent slot' });
  }
});

/**
 * POST /api/subscription/update-plan
 * Update subscription plan
 */
router.post('/update-plan', (req, res) => {
  try {
    const { planId } = req.body;
    const db = getDatabase();

    // Define plan features
    const plans = {
      free: { maxAgents: 2, maxConversations: 100, maxMessagesPerMonth: 1000 },
      basic: { maxAgents: 5, maxConversations: 500, maxMessagesPerMonth: 5000 },
      pro: { maxAgents: 20, maxConversations: 2000, maxMessagesPerMonth: 20000 },
      enterprise: { maxAgents: 100, maxConversations: 10000, maxMessagesPerMonth: 100000 }
    };

    const features = plans[planId] || plans.free;

    db.prepare(`
      UPDATE subscriptions SET plan = ?, features = ?, updated_at = datetime('now')
      WHERE user_id = ? AND status = 'active'
    `).run(planId, JSON.stringify(features), req.user.id);

    res.json({ plan: planId, features });

  } catch (error) {
    logger.error(`Failed to update plan: ${error.message}`);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * GET /api/subscription/payments
 * Get payment history
 */
router.get('/payments', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    const payments = db.prepare(`
      SELECT * FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    res.json({ payments });

  } catch (error) {
    logger.error(`Failed to get payments: ${error.message}`);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

/**
 * POST /api/subscription/billing-portal
 * Get Stripe billing portal URL
 */
router.post('/billing-portal', async (req, res) => {
  try {
    const { returnUrl } = req.body;

    // TODO: Implement actual Stripe billing portal
    res.json({
      url: returnUrl || '/'
    });

  } catch (error) {
    logger.error(`Failed to get billing portal: ${error.message}`);
    res.status(500).json({ error: 'Failed to get billing portal' });
  }
});

module.exports = router;
