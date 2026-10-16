package io.github.keeper575.slowweek.helper

import io.github.keeper575.slowweek.helper.AppEvent.Kind.ACTIVITY_END
import io.github.keeper575.slowweek.helper.AppEvent.Kind.ACTIVITY_START
import io.github.keeper575.slowweek.helper.AppEvent.Kind.DEVICE_OFF
import io.github.keeper575.slowweek.helper.AppEvent.Kind.SERVICE_END
import io.github.keeper575.slowweek.helper.AppEvent.Kind.SERVICE_START
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class UsageMathTest {
    private val min = 60_000L
    private val kindle = "com.amazon.kindle"
    private val audible = "com.audible.application"

    private fun ev(minute: Long, kind: AppEvent.Kind, pkg: String = kindle, component: String = "Reader") =
        AppEvent(minute * min, pkg, component, kind)

    private fun total(events: List<AppEvent>, pkg: String = kindle, services: Boolean = false, from: Long = 0, to: Long = 1000) =
        UsageMath.minutes(UsageMath.intervals(events, pkg, services, to * min), from * min, to * min)

    @Test fun countsTimeBetweenOpenAndClose() {
        assertEquals(30.0, total(listOf(ev(10, ACTIVITY_START), ev(40, ACTIVITY_END))), 0.001)
    }

    @Test fun switchingScreensInsideTheAppIsOneSession() {
        val events = listOf(
            ev(0, ACTIVITY_START, component = "Library"),
            ev(5, ACTIVITY_START, component = "Reader"), // Reader opens before Library reports paused
            ev(6, ACTIVITY_END, component = "Library"),
            ev(20, ACTIVITY_END, component = "Reader"),
        )
        assertEquals(20.0, total(events), 0.001)
    }

    @Test fun ignoresOtherApps() {
        val events = listOf(ev(0, ACTIVITY_START, pkg = "com.other"), ev(50, ACTIVITY_END, pkg = "com.other"))
        assertEquals(0.0, total(events), 0.001)
    }

    @Test fun audiblePlaybackWithScreenOffCountsAndOverlapCountsOnce() {
        val events = listOf(
            ev(0, ACTIVITY_START, audible, "Player"),
            ev(2, SERVICE_START, audible, "PlayerService"), // press play
            ev(5, ACTIVITY_END, audible, "Player"), // screen off, still playing
            ev(65, SERVICE_END, audible, "PlayerService"),
        )
        assertEquals(65.0, total(events, audible, services = true), 0.001)
        assertEquals(5.0, total(events, audible, services = false), 0.001)
    }

    @Test fun stillOpenCountsUntilNow() {
        assertEquals(15.0, total(listOf(ev(85, ACTIVITY_START)), to = 100), 0.001)
    }

    @Test fun onlyCountsInsideTheWeek() {
        // Opened 10 minutes before the week started, closed 20 minutes into it.
        assertEquals(20.0, total(listOf(ev(90, ACTIVITY_START), ev(120, ACTIVITY_END)), from = 100), 0.001)
    }

    @Test fun phoneShutdownClosesSessions() {
        val events = listOf(ev(0, SERVICE_START, audible, "PlayerService"), ev(30, DEVICE_OFF, pkg = "android"))
        assertEquals(30.0, total(events, audible, services = true), 0.001)
    }

    @Test fun closeWithoutOpenIsIgnored() {
        assertEquals(10.0, total(listOf(ev(5, ACTIVITY_END), ev(10, ACTIVITY_START), ev(20, ACTIVITY_END))), 0.001)
    }

    @Test fun weekStartsOnMondayMidnightLocalTime() {
        val zone = ZoneId.of("Asia/Kolkata")
        val thursday = java.time.ZonedDateTime.of(2026, 10, 15, 21, 30, 0, 0, zone).toInstant().toEpochMilli()
        val start = UsageMath.weekStart(thursday, zone)
        assertEquals("2026-10-12T00:00+05:30[Asia/Kolkata]", start.toString())
        val monday = start.toInstant().toEpochMilli()
        assertEquals(start, UsageMath.weekStart(monday, zone))
    }
}
