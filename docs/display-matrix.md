# Display robustness acceptance

The owner tested Basic Bingo on Windows with a second monitor and a KVM switch. The exact
resolutions and scaling values used in the local tests were not recorded. The owner accepted the
remaining scenarios without a separate test pass.

| Scenario | Result | Observation or expected behavior |
| --- | --- | --- |
| Windows Duplicate mode | Passed on the second monitor setup | The Controller offered Preview only. |
| Windows Extend mode | Passed on the second monitor setup | Project opened Presentation on the second monitor while the Controller stayed on the first. |
| Change the second monitor’s resolution while projecting | Passed on the second monitor | The owner tried several resolutions and reported that Presentation looked good at each. |
| Disconnect and reconnect the second monitor directly at the PC | Passed on the second monitor | The owner confirmed the direct disconnect and reconnect worked. Basic Bingo is designed to stop Presentation and show a notice when Windows removes the display. The operator can project again after reconnecting. |
| Disconnect and reconnect the monitor at the KVM | Observed, investigation waived | The Controller’s balls and Current Call flickered for about five seconds after disconnect. Projection stayed active, and the same game was visible when the cable was reconnected. The cause of the flicker was unconfirmed. |
| 100%, 125%, and 150% scaling on both displays | Accepted without a separate run | The Controller and Presentation should remain visible and usable at each scale. |
| Sleep and resume while projecting | Accepted without a separate run | The current game should survive. Presentation should either resume or be available to reopen with Project. |
| Projector power cycle at the venue | Accepted without a separate run | If Windows removes the display, Basic Bingo should stop Presentation and let the operator project again once it reappears. |
| Change display order or primary display | Accepted without a separate run | Presentation should refit if the target moves. If the Controller moves onto the target, Presentation should close and the game should remain available. |
