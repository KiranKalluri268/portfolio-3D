export class ThreeDQualityManager {
  constructor({
    tiers = ['low', 'medium', 'high'],
    initialTier = 'medium',
    warmupMs = 5000,
    healthyFrameMs = 18,
    heavyFrameMs = 20,
    panicFrameMs = 50,
    heavyFrameLimit = 5,
    cooldownMs = 7000,
    upgradeStableMs = 3000,
    mediumHeavyFrameLimit = 20,
    lowToMediumProbeMs = 8000,
    mediumProbeEvaluationMs = 6000,
    failedProbeCooldownMs = 20000,
    allowHighAutoUpgrade = false,
    onQualityDowngrade = () => {},
    onQualityUpgrade = () => {},
    onWarmupComplete = () => {},
  } = {}) {
    this.tiers = tiers;
    this.currentTier = initialTier;

    // Time budget thresholds. 16.67ms is ideal 60 FPS; >20ms is struggling.
    this.healthyFrameMs = healthyFrameMs;
    this.heavyFrameMs = heavyFrameMs;
    this.panicFrameMs = panicFrameMs;

    // Heavy frames build pressure quickly; healthy frames bleed pressure off.
    this.heavyFrameLimit = heavyFrameLimit;
    this.heavyFrameCounter = 0;

    // Progressive enhancement starts from a safe baseline and only upgrades
    // after sustained headroom during the initial benchmark window.
    this.warmupMs = warmupMs;
    this.warmupElapsedMs = 0;
    this.warmupComplete = false;
    this.warmupHeavyFrames = 0;
    this.warmupPanicFrames = 0;

    // Anti-oscillation: after any tier change, ignore ordinary upgrade/downgrade
    // signals until the cooldown expires. Panic frames can still downgrade.
    this.cooldownMs = cooldownMs;
    this.cooldownRemainingMs = 0;

    // Runtime upgrades are intentionally stricter than downgrades.
    this.upgradeStableMs = upgradeStableMs;
    this.upgradeStableElapsedMs = 0;

    // Low cannot reveal spare GPU capacity when RAF is VSync-capped. After a
    // stable period, temporarily probe Medium and judge performance there.
    this.mediumHeavyFrameLimit = mediumHeavyFrameLimit;
    this.lowToMediumProbeMs = lowToMediumProbeMs;
    this.mediumProbeEvaluationMs = mediumProbeEvaluationMs;
    this.failedProbeCooldownMs = failedProbeCooldownMs;
    this.allowHighAutoUpgrade = allowHighAutoUpgrade;
    this.mediumProbeActive = false;
    this.mediumProbeElapsedMs = 0;
    this.mediumProbeHeavyFrames = 0;

    this.previousTimestampMs = null;
    this.onQualityDowngrade = onQualityDowngrade;
    this.onQualityUpgrade = onQualityUpgrade;
    this.onWarmupComplete = onWarmupComplete;
  }

  setTier(tier, { startCooldown = true } = {}) {
    if (!this.tiers.includes(tier)) return;

    this.currentTier = tier;
    this.heavyFrameCounter = 0;
    this.upgradeStableElapsedMs = 0;
    if (tier !== 'medium') {
      this.mediumProbeActive = false;
      this.mediumProbeElapsedMs = 0;
      this.mediumProbeHeavyFrames = 0;
    }
    if (startCooldown) {
      this.cooldownRemainingMs = this.cooldownMs;
    }
  }

  update(timestampMs = performance.now()) {
    if (this.previousTimestampMs === null) {
      this.previousTimestampMs = timestampMs;
      return;
    }

    const frameMs = timestampMs - this.previousTimestampMs;
    this.previousTimestampMs = timestampMs;

    if (frameMs <= 0) return;

    if (!this.warmupComplete) {
      this.updateWarmup(frameMs);
      return;
    }

    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - frameMs);

      // Panic frames indicate a backed-up GPU queue; downgrade even in cooldown.
      if (frameMs > this.panicFrameMs) {
        this.downgrade('panic');
      }
      return;
    }

    if (frameMs > this.panicFrameMs) {
      this.downgrade('panic');
      return;
    }

    if (this.mediumProbeActive) {
      this.updateMediumProbe(frameMs);
      return;
    }

    if (frameMs > this.heavyFrameMs) {
      this.heavyFrameCounter++;
      this.upgradeStableElapsedMs = 0;

      const heavyLimit = this.currentTier === 'medium'
        ? this.mediumHeavyFrameLimit
        : this.heavyFrameLimit;

      if (this.heavyFrameCounter > heavyLimit) {
        this.downgrade('heavy-frame-budget');
      }
      return;
    }

    if (frameMs < this.healthyFrameMs) {
      this.heavyFrameCounter = Math.max(0, this.heavyFrameCounter - 1);
      this.trackUpgradeHeadroom(frameMs);
      return;
    }

    this.upgradeStableElapsedMs = 0;
  }

  updateWarmup(frameMs) {
    this.warmupElapsedMs += frameMs;

    if (frameMs > this.panicFrameMs) {
      this.warmupPanicFrames++;
    }

    if (frameMs > this.heavyFrameMs) {
      this.warmupHeavyFrames++;
    }

    if (this.warmupElapsedMs < this.warmupMs) return;

    this.warmupComplete = true;
    this.onWarmupComplete({
      tier: this.currentTier,
      heavyFrames: this.warmupHeavyFrames,
      panicFrames: this.warmupPanicFrames,
    });

    // Only enhance if the baseline survived warmup with clear headroom.
    if (this.warmupHeavyFrames === 0 && this.warmupPanicFrames === 0) {
      if (this.currentTier === 'low') {
        this.startMediumProbe();
      } else if (this.currentTier === 'medium' && this.allowHighAutoUpgrade) {
        this.upgrade('warmup-headroom');
      }
    } else if (this.warmupPanicFrames > 0 || this.warmupHeavyFrames > this.heavyFrameLimit) {
      this.downgrade('warmup-struggling');
    }
  }

  trackUpgradeHeadroom(frameMs) {
    if (this.isHighestTier()) {
      this.upgradeStableElapsedMs = 0;
      return;
    }

    this.upgradeStableElapsedMs += frameMs;

    if (this.currentTier === 'low' && this.upgradeStableElapsedMs >= this.lowToMediumProbeMs) {
      this.startMediumProbe();
      return;
    }

    if (
      this.currentTier === 'medium' &&
      this.allowHighAutoUpgrade &&
      this.upgradeStableElapsedMs >= this.upgradeStableMs
    ) {
      this.upgrade('sustained-headroom');
    }
  }

  startMediumProbe() {
    this.mediumProbeActive = true;
    this.mediumProbeElapsedMs = 0;
    this.mediumProbeHeavyFrames = 0;
    this.setTier('medium', { startCooldown: false });
    this.mediumProbeActive = true;
    this.onQualityUpgrade('medium', { reason: 'low-to-medium-probe' });
  }

  updateMediumProbe(frameMs) {
    this.mediumProbeElapsedMs += frameMs;

    if (frameMs > this.heavyFrameMs) {
      this.mediumProbeHeavyFrames++;
    }

    if (this.mediumProbeHeavyFrames > this.mediumHeavyFrameLimit) {
      this.failMediumProbe();
      return;
    }

    if (this.mediumProbeElapsedMs >= this.mediumProbeEvaluationMs) {
      this.mediumProbeActive = false;
      this.mediumProbeElapsedMs = 0;
      this.mediumProbeHeavyFrames = 0;
      this.cooldownRemainingMs = this.cooldownMs;
    }
  }

  failMediumProbe() {
    this.mediumProbeActive = false;
    this.mediumProbeElapsedMs = 0;
    this.mediumProbeHeavyFrames = 0;
    this.setTier('low', { startCooldown: false });
    this.cooldownRemainingMs = this.failedProbeCooldownMs;
    this.onQualityDowngrade('low', { reason: 'medium-probe-failed' });
  }

  downgrade(reason) {
    const tierIndex = this.tiers.indexOf(this.currentTier);
    if (tierIndex <= 0) {
      this.heavyFrameCounter = 0;
      this.upgradeStableElapsedMs = 0;
      return;
    }

    const nextTier = this.tiers[tierIndex - 1];
    this.setTier(nextTier);
    this.onQualityDowngrade(nextTier, { reason });
  }

  upgrade(reason) {
    const tierIndex = this.tiers.indexOf(this.currentTier);
    if (tierIndex < 0 || tierIndex >= this.tiers.length - 1) {
      this.upgradeStableElapsedMs = 0;
      return;
    }

    const nextTier = this.tiers[tierIndex + 1];
    this.setTier(nextTier);
    this.onQualityUpgrade(nextTier, { reason });
  }

  isHighestTier() {
    return this.currentTier === this.tiers[this.tiers.length - 1];
  }
}
