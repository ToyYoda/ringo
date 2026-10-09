package de.hochzeitsapp.util

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import java.io.File

/**
 * Minimal A4 text-to-PDF writer for the printable summaries ("ausdruckbare Zusammenfassung").
 * Lines starting with "# " become headings.
 */
object PdfExport {
    private const val W = 595
    private const val H = 842
    private const val MARGIN = 48

    fun share(context: Context, fileName: String, title: String, lines: List<String>) {
        val doc = PdfDocument()
        val titlePaint = TextPaint().apply { textSize = 22f; typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD); color = 0xFF8E3B5A.toInt() }
        val headPaint = TextPaint().apply { textSize = 14f; typeface = Typeface.DEFAULT_BOLD; color = 0xFF2E2427.toInt() }
        val bodyPaint = TextPaint().apply { textSize = 11f; color = 0xFF2E2427.toInt() }
        val linePaint = Paint().apply { color = 0xFFB8915A.toInt(); strokeWidth = 1.5f }

        var pageNo = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, pageNo).create())
        var y = MARGIN.toFloat()

        fun draw(text: String, paint: TextPaint, spacingAfter: Float) {
            val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, W - 2 * MARGIN)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).build()
            if (y + layout.height > H - MARGIN) {
                doc.finishPage(page)
                page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, ++pageNo).create())
                y = MARGIN.toFloat()
            }
            page.canvas.save()
            page.canvas.translate(MARGIN.toFloat(), y)
            layout.draw(page.canvas)
            page.canvas.restore()
            y += layout.height + spacingAfter
        }

        draw(title, titlePaint, 6f)
        page.canvas.drawLine(MARGIN.toFloat(), y, (W - MARGIN).toFloat(), y, linePaint)
        y += 14f
        lines.forEach { line ->
            if (line.startsWith("# ")) { y += 6f; draw(line.removePrefix("# "), headPaint, 4f) }
            else draw(line, bodyPaint, 3f)
        }
        doc.finishPage(page)

        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, fileName)
        file.outputStream().use { doc.writeTo(it) }
        doc.close()

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(send, title))
    }
}
