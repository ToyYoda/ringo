package de.hochzeitsapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.hochzeitsapp.ui.UiState
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Demo photos are drawn, not shipped as stock images. */
private val demoArt: Map<String, Pair<ImageVector, List<Color>>> = mapOf(
    "rings" to (Icons.Default.Favorite to listOf(Color(0xFFE8C9A0), Color(0xFFB8915A))),
    "location" to (Icons.Default.Castle to listOf(Color(0xFF9DBE9A), Color(0xFF4F7A5A))),
    "dessert" to (Icons.Default.Icecream to listOf(Color(0xFFF6D9E2), Color(0xFFC77D92))),
    "flowers" to (Icons.Default.LocalFlorist to listOf(Color(0xFFF4C7C3), Color(0xFF8E3B5A))),
    "couple" to (Icons.Default.People to listOf(Color(0xFFB79AAE), Color(0xFF5E2139))),
    "cake" to (Icons.Default.Cake to listOf(Color(0xFFFFF1D6), Color(0xFFD6A86C))),
)

@Composable
fun PhotoImage(uri: String, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    if (uri.startsWith("demo:")) {
        val (icon, cols) = demoArt[uri.removePrefix("demo:")] ?: (Icons.Default.Image to listOf(Color.LightGray, Color.Gray))
        Box(modifier.background(Brush.linearGradient(cols)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.fillMaxSize(0.35f))
        }
    } else {
        AsyncImage(model = uri, contentDescription = null, modifier = modifier, contentScale = contentScale)
    }
}

/** Standard page: arc header followed by lazy content and an optional FAB. */
@Composable
fun HeaderPage(
    ui: UiState,
    title: String,
    description: String? = null,
    onBack: (() -> Unit)? = null,
    fab: (@Composable () -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val p = ui.wedding?.profile ?: return
    Scaffold(
        floatingActionButton = { fab?.invoke() },
        contentWindowInsets = WindowInsets(0),
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        val listState = rememberLazyListState()
        Box(Modifier.padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                state = listState,
                contentPadding = PaddingValues(bottom = 96.dp),
            ) {
                item { WeddingHeader(p.motto, p.coupleNames, p.coverPhoto, title, description, onBack) }
                content()
            }
            StatusBarScrim(listState)
        }
    }
}

@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    icon: ImageVector? = null,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    ElevatedCard(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            if (title != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (icon != null) {
                        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    action?.invoke()
                }
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.secondary,
        fontWeight = FontWeight.Bold,
        modifier = modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
fun EmptyState(icon: ImageVector, text: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(8.dp))
        Text(text, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Avatar(name: String, photo: String?, size: Dp = 44.dp) {
    if (photo != null) {
        PhotoImage(photo, Modifier.size(size).clip(CircleShape))
    } else {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() },
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun Pill(text: String, color: Color = MaterialTheme.colorScheme.secondaryContainer, textColor: Color = MaterialTheme.colorScheme.onSecondaryContainer) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = textColor,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    required: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboard: KeyboardType = KeyboardType.Text,
    placeholder: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(if (required) "$label *" else label) },
        placeholder = placeholder?.let { { Text(it) } },
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
    )
}

/** Simple dropdown for picking one of a few options. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Picker(label: String, options: List<T>, selected: T, display: (T) -> String, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier.padding(vertical = 4.dp)) {
        OutlinedTextField(
            value = display(selected),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach {
                DropdownMenuItem(text = { Text(display(it)) }, onClick = { onSelect(it); open = false })
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String = "Löschen", onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}

/** Full-screen form dialog with save/cancel in the top bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormDialog(title: String, onDismiss: () -> Unit, onSave: () -> Unit, saveEnabled: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column {
                TopAppBar(
                    title = { Text(title) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Schließen") } },
                    actions = { TextButton(onClick = onSave, enabled = saveEnabled) { Text("Speichern") } },
                )
                Column(
                    Modifier
                        .weight(1f)
                        .imePadding()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    content = content,
                )
            }
        }
    }
}

fun formatTime(ts: Long): String = SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date(ts))

fun formatEuro(v: Double): String = String.format(Locale.GERMANY, "%,.0f €", v)

/** Parses "dd.MM.yyyy" for sorting; unparsable dates go last. */
fun dateKey(date: String, time: String = ""): String {
    val p = date.split(".")
    return if (p.size == 3) "${p[2]}${p[1].padStart(2, '0')}${p[0].padStart(2, '0')}$time" else "99999999$time"
}

@Composable
fun NotFound(onBack: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Dieser Eintrag existiert nicht mehr.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onBack) { Text("Zurück") }
    }
}

/** Keeps scrolled content from running under the transparent status bar. */
@Composable
fun StatusBarScrim(listState: LazyListState) {
    val scrolled by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 300 } }
    if (scrolled) {
        Box(
            Modifier
                .fillMaxWidth()
                .windowInsetsTopHeight(WindowInsets.statusBars)
                .background(MaterialTheme.colorScheme.background.copy(alpha = 0.97f))
        )
    }
}
