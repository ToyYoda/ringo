package de.hochzeitsapp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.hochzeitsapp.ui.theme.Gold
import de.hochzeitsapp.ui.theme.MottoStyle
import de.hochzeitsapp.ui.theme.Script

/** Lets any screen open the navigation drawer without threading callbacks through every call. */
val LocalOpenDrawer = compositionLocalOf<() -> Unit> { {} }

/**
 * The swung arc from the paper sketches ("Bogen Kopf"): flat along the top-left,
 * then sweeping down to the bottom-right corner.
 */
private fun arcPath(size: Size): Path = Path().apply {
    val w = size.width
    val h = size.height
    moveTo(0f, 0f)
    lineTo(w, 0f)
    lineTo(w, h)
    cubicTo(w * 0.70f, h * 0.98f, w * 0.62f, h * 0.45f, w * 0.40f, h * 0.45f)
    lineTo(0f, h * 0.45f)
    close()
}

private object ArcShape : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density) =
        Outline.Generic(arcPath(size))
}

/**
 * Kopfbereich jeder Seite: Motto oben links, Foto im Bogen, Namen des Brautpaars
 * in Schreibschrift rechts, darunter Seitentitel und Erklärung.
 */
@Composable
fun WeddingHeader(
    motto: String,
    coupleNames: String,
    coverPhoto: String?,
    title: String? = null,
    description: String? = null,
    onBack: (() -> Unit)? = null,
    big: Boolean = false,
) {
    val statusBar = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val height = (if (big) 300.dp else 200.dp) + statusBar
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
    ) {
        // Foto (oder Verlauf) im Bogen
        Box(
            Modifier
                .fillMaxSize()
                .clip(ArcShape)
        ) {
            if (coverPhoto != null) {
                PhotoImage(coverPhoto, Modifier.fillMaxSize())
            }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.linearGradient(
                            if (coverPhoto != null) listOf(Color(0x995E2139), Color(0x338E3B5A))
                            else listOf(Color(0xFF8E3B5A), Color(0xFFC77D92))
                        )
                    )
            )
        }
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val p = Path().apply {
                moveTo(0f, h * 0.45f)
                lineTo(w * 0.40f, h * 0.45f)
                cubicTo(w * 0.62f, h * 0.45f, w * 0.70f, h * 0.98f, w, h)
            }
            drawPath(p, Gold, style = Stroke(width = 2.dp.toPx()))
        }

        Row(
            Modifier
                .statusBarsPadding()
                .padding(start = 4.dp, top = 4.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val openDrawer = LocalOpenDrawer.current
            IconButton(onClick = { onBack?.invoke() ?: openDrawer() }) {
                Icon(
                    if (onBack != null) Icons.AutoMirrored.Filled.ArrowBack else Icons.Default.Menu,
                    contentDescription = if (onBack != null) "Zurück" else "Menü",
                    tint = Color.White,
                )
            }
            Text(motto, style = MottoStyle, color = Color.White, maxLines = 1)
        }

        Text(
            coupleNames.replace(" & ", "\n&\n"),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 44.dp, end = 20.dp),
            fontFamily = Script,
            fontSize = if (big) 40.sp else 30.sp,
            lineHeight = if (big) 40.sp else 30.sp,
            color = Color.White,
            textAlign = TextAlign.Center,
        )

        if (title != null) {
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth(0.62f)
                    .padding(start = 20.dp, bottom = 12.dp)
            ) {
                Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Medium)
                if (!description.isNullOrBlank()) {
                    Text(
                        description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                    )
                }
            }
        }
    }
}
