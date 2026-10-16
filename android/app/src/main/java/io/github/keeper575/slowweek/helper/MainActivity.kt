package io.github.keeper575.slowweek.helper

import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread
import kotlin.math.roundToInt

/**
 * One screen: this week's Kindle and Audible minutes, read from Android's usage records, and a button
 * that opens Slow Week with them (…/?sync=1&week=2026-10-12&kindle=42&audible=180).
 */
class MainActivity : Activity() {
    private data class Source(val key: String, val label: String, val pkg: String, val countServices: Boolean)

    private val sources = listOf(
        // Kindle: time the app is on screen.
        Source("kindle", "Kindle", "com.amazon.kindle", countServices = false),
        // Audible: on screen, plus time its player runs as a foreground service (playing with the screen off).
        Source("audible", "Audible", "com.audible.application", countServices = true),
    )

    private lateinit var weekLabel: TextView
    private lateinit var accessNote: TextView
    private lateinit var grantButton: Button
    private lateinit var results: LinearLayout
    private lateinit var syncButton: Button
    private lateinit var urlField: EditText
    private val valueViews = mutableMapOf<String, TextView>()

    private var weekKey = ""
    private var minutes: Map<String, Int> = emptyMap()

    private val prefs by lazy { getSharedPreferences("settings", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(32), dp(24), dp(32))
        }
        column.addView(text("Slow Week helper", 26f, bold = true))
        weekLabel = text("", 15f).also { column.addView(it, gap(4)) }

        accessNote = text(
            "To count your reading and listening time, this app needs Usage access. " +
                "Tap the button, find \"Slow Week helper\" and switch it on, then come back.",
            15f,
        ).also { column.addView(it, gap(24)) }
        grantButton = Button(this).apply {
            text = "Grant usage access"
            setOnClickListener { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
        }.also { column.addView(it, gap(12)) }

        results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (source in sources) {
            results.addView(text(source.label, 15f), gap(20))
            valueViews[source.key] = text("…", 32f, bold = true).also { results.addView(it) }
        }
        results.addView(
            text(
                "Kindle counts time the app is open on screen. Audible counts time it is playing, " +
                    "including with the screen off. Pages can't be read from either app.",
                13f,
            ),
            gap(20),
        )
        syncButton = Button(this).apply {
            text = "Send to Slow Week"
            setOnClickListener { sync() }
        }
        results.addView(syncButton, gap(24))
        results.addView(
            text("In Slow Week, edit a goal and set \"Auto-fill from\" to Kindle or Audible to receive these minutes.", 13f),
            gap(8),
        )
        column.addView(results)

        column.addView(text("Slow Week address", 13f), gap(32))
        urlField = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
            setText(prefs.getString("url", DEFAULT_URL))
        }
        column.addView(urlField)

        setContentView(ScrollView(this).apply { addView(column) })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onPause() {
        super.onPause()
        prefs.edit().putString("url", urlField.text.toString().trim()).apply()
    }

    private fun refresh() {
        val now = System.currentTimeMillis()
        val start = UsageMath.weekStart(now)
        weekKey = start.format(DateTimeFormatter.ISO_LOCAL_DATE)
        weekLabel.text = "This week, since ${start.format(DateTimeFormatter.ofPattern("EEE d MMM"))}"

        val granted = hasUsageAccess()
        accessNote.visibility = if (granted) View.GONE else View.VISIBLE
        grantButton.visibility = if (granted) View.GONE else View.VISIBLE
        results.visibility = if (granted) View.VISIBLE else View.GONE
        if (!granted) return

        syncButton.isEnabled = false
        val from = start.toInstant().toEpochMilli()
        thread {
            // Read from a day earlier so sessions already running at Monday 00:00 have their start event.
            val events = readEvents(from - 24 * 60 * 60_000L, now)
            val counted = sources.associate { s ->
                s.key to UsageMath.minutes(UsageMath.intervals(events, s.pkg, s.countServices, now), from, now).roundToInt()
            }
            runOnUiThread {
                minutes = counted
                for (s in sources) {
                    valueViews.getValue(s.key).text =
                        if (isInstalled(s.pkg)) formatMinutes(counted.getValue(s.key)) else "Not installed"
                }
                syncButton.isEnabled = true
            }
        }
    }

    private fun sync() {
        val base = urlField.text.toString().trim().ifEmpty { DEFAULT_URL }
        prefs.edit().putString("url", base).apply()
        val uri = Uri.parse(base).buildUpon()
            .appendQueryParameter("sync", "1")
            .appendQueryParameter("week", weekKey)
            .apply { sources.filter { isInstalled(it.pkg) }.forEach { appendQueryParameter(it.key, minutes[it.key].toString()) } }
            .build()
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: Exception) {
            Toast.makeText(this, "Couldn't open $base", Toast.LENGTH_LONG).show()
        }
    }

    private fun readEvents(from: Long, to: Long): List<AppEvent> {
        val usage = getSystemService(USAGE_STATS_SERVICE) as UsageStatsManager
        val wanted = sources.map { it.pkg }.toSet()
        val list = mutableListOf<AppEvent>()
        val stream = usage.queryEvents(from, to)
        val e = UsageEvents.Event()
        while (stream.hasNextEvent()) {
            stream.getNextEvent(e)
            val kind = when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> AppEvent.Kind.ACTIVITY_START
                UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> AppEvent.Kind.ACTIVITY_END
                UsageEvents.Event.FOREGROUND_SERVICE_START -> AppEvent.Kind.SERVICE_START
                UsageEvents.Event.FOREGROUND_SERVICE_STOP -> AppEvent.Kind.SERVICE_END
                UsageEvents.Event.DEVICE_SHUTDOWN -> AppEvent.Kind.DEVICE_OFF
                else -> continue
            }
            if (kind != AppEvent.Kind.DEVICE_OFF && e.packageName !in wanted) continue
            list.add(AppEvent(e.timeStamp, e.packageName, e.className ?: "", kind))
        }
        return list
    }

    private fun hasUsageAccess(): Boolean {
        val ops = getSystemService(APP_OPS_SERVICE) as AppOpsManager
        val mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), packageName)
        return if (mode == AppOpsManager.MODE_DEFAULT) {
            checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
        } else {
            mode == AppOpsManager.MODE_ALLOWED
        }
    }

    private fun isInstalled(pkg: String) = try {
        packageManager.getApplicationInfo(pkg, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private fun formatMinutes(total: Int) = when {
        total < 60 -> "$total min"
        total % 60 == 0 -> "${total / 60} h"
        else -> "${total / 60} h ${total % 60} min"
    }

    private fun text(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun gap(top: Int) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(top) }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

    companion object {
        const val DEFAULT_URL = "https://keeper575.github.io/low-dopamine-tracker/"
    }
}
