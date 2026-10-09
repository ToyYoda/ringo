package de.hochzeitsapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Burgundy = Color(0xFF8E3B5A)
val BurgundyDark = Color(0xFF5E2139)
val Gold = Color(0xFFB8915A)
val Ivory = Color(0xFFFBF7F4)
val Blush = Color(0xFFF3E6E6)
val Ink = Color(0xFF2E2427)
val Success = Color(0xFF4F7A5A)

private val colors = lightColorScheme(
    primary = Burgundy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF6D9E2),
    onPrimaryContainer = BurgundyDark,
    secondary = Gold,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF3E4CC),
    onSecondaryContainer = Color(0xFF4A3615),
    tertiary = Success,
    background = Ivory,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Blush,
    onSurfaceVariant = Color(0xFF6B5A5F),
    surfaceContainerLow = Color(0xFFFFFBFA),
    surfaceContainer = Color(0xFFF8F0EE),
    outline = Color(0xFFCDBBBF),
    outlineVariant = Color(0xFFE8DCDD),
)

/** Schreibschrift für die Namen des Brautpaars (auf Android: Dancing Script). */
val Script = FontFamily.Cursive

private val base = Typography()
private val typography = Typography(
    displaySmall = base.displaySmall.copy(fontFamily = FontFamily.Serif),
    headlineLarge = base.headlineLarge.copy(fontFamily = FontFamily.Serif),
    headlineMedium = base.headlineMedium.copy(fontFamily = FontFamily.Serif),
    headlineSmall = base.headlineSmall.copy(fontFamily = FontFamily.Serif),
    titleLarge = base.titleLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
)

val MottoStyle = TextStyle(fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 14.sp, letterSpacing = 0.5.sp)

@Composable
fun HochzeitsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
