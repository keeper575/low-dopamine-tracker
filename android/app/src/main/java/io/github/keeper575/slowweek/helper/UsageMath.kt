package io.github.keeper575.slowweek.helper

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters

/** A usage event reduced to what minute counting needs. Kept free of Android types so it can be unit tested. */
data class AppEvent(val time: Long, val pkg: String, val component: String, val kind: Kind) {
    enum class Kind { ACTIVITY_START, ACTIVITY_END, SERVICE_START, SERVICE_END, DEVICE_OFF }
}

object UsageMath {
    /**
     * Time ranges when [pkg] was in use: any of its screens on top or, with [countServices], any of its
     * foreground services running (how audio apps keep playing with the screen off). Overlaps count once.
     * Anything still open at [end] is closed there.
     */
    fun intervals(events: List<AppEvent>, pkg: String, countServices: Boolean, end: Long): List<LongRange> {
        val result = mutableListOf<LongRange>()
        val open = mutableSetOf<String>()
        var start = 0L

        fun close(at: Long) {
            if (open.isNotEmpty() && at > start) result.add(start until at)
            open.clear()
        }

        for (e in events.sortedBy { it.time }) {
            if (e.kind == AppEvent.Kind.DEVICE_OFF) {
                close(e.time)
                continue
            }
            if (e.pkg != pkg) continue
            val key = when (e.kind) {
                AppEvent.Kind.ACTIVITY_START, AppEvent.Kind.ACTIVITY_END -> "activity:${e.component}"
                else -> if (countServices) "service:${e.component}" else continue
            }
            when (e.kind) {
                AppEvent.Kind.ACTIVITY_START, AppEvent.Kind.SERVICE_START -> {
                    if (open.isEmpty()) start = e.time
                    open.add(key)
                }
                else -> if (open.remove(key) && open.isEmpty() && e.time > start) result.add(start until e.time)
            }
        }
        close(end)
        return result
    }

    /** Minutes covered by [ranges] between [from] and [to]. */
    fun minutes(ranges: List<LongRange>, from: Long, to: Long): Double =
        ranges.sumOf { maxOf(0L, minOf(it.last + 1, to) - maxOf(it.first, from)) } / 60_000.0

    /** Start of the week (Monday 00:00 local time) containing [now], matching the Slow Week web app. */
    fun weekStart(now: Long, zone: ZoneId = ZoneId.systemDefault()): ZonedDateTime =
        Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            .atStartOfDay(zone)
}
