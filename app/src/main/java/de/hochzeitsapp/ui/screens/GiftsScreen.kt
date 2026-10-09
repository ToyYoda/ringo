package de.hochzeitsapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.Gift
import de.hochzeitsapp.data.Group
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.ui.theme.Success

/**
 * Geschenkeliste: Das Brautpaar pflegt Wünsche, Gäste haken anonym ab.
 * Das Brautpaar sieht nicht, was reserviert ist – die Überraschung bleibt.
 */
@Composable
fun GiftsScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    val context = LocalContext.current
    var edit by remember { mutableStateOf<Gift?>(null) }

    HeaderPage(
        ui, "Geschenkeliste",
        if (ui.isCouple) "Eure Wünsche. Was schon reserviert ist, bleibt für euch geheim." else "Hakt anonym ab, was ihr schenkt – so gibt es nichts doppelt.",
        fab = if (ui.isCouple) ({
            ExtendedFloatingActionButton(onClick = { edit = Gift(title = "") }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Wunsch") })
        }) else null,
    ) {
        if (w.gifts.isEmpty()) item { EmptyState(Icons.Default.CardGiftcard, "Noch keine Wünsche eingetragen.") }
        items(w.gifts, key = { it.id }) { gift ->
            val group = w.groups.find { it.giftId == gift.id }
            val mine = gift.reservedBy == ui.myId
            val showReserved = !ui.isCouple && gift.reserved
            SectionCard {
                Row(verticalAlignment = Alignment.Top) {
                    if (!ui.isCouple) {
                        Checkbox(
                            checked = gift.reserved,
                            onCheckedChange = { vm.toggleGiftReservation(gift.id) },
                            enabled = !gift.reserved || mine,
                        )
                    } else {
                        Icon(Icons.Default.CardGiftcard, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(12.dp))
                    }
                    Column(Modifier.weight(1f).padding(top = 10.dp)) {
                        Text(
                            gift.title, style = MaterialTheme.typography.titleMedium,
                            textDecoration = if (showReserved && !mine) TextDecoration.LineThrough else null,
                        )
                        if (gift.description.isNotBlank()) Text(gift.description, style = MaterialTheme.typography.bodySmall)
                        if (gift.price.isNotBlank()) Text(gift.price, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                        if (showReserved) Text(if (mine) "Du schenkst das (anonym)" else "Wird schon geschenkt", style = MaterialTheme.typography.labelMedium, color = Success, fontWeight = FontWeight.SemiBold)
                        if (group != null && (!ui.isCouple || !group.hiddenFromCouple)) {
                            Text("Gruppengeschenk: ${formatEuro(group.collected)} von ${formatEuro(group.targetAmount)}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 4.dp))
                            if (group.targetAmount > 0) LinearProgressIndicator(progress = { (group.collected / group.targetAmount).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp))
                        }
                        Row {
                            if (gift.link.isNotBlank()) TextButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(gift.link))) } }) {
                                Text("Ansehen"); Spacer(Modifier.width(4.dp)); Icon(Icons.AutoMirrored.Filled.OpenInNew, null, Modifier.size(16.dp))
                            }
                            if (!ui.isCouple && group != null) TextButton(onClick = { navigate("group/${group.id}") }) { Text("Zur Gruppe") }
                            if (!ui.isCouple && group == null && !gift.reserved) TextButton(onClick = {
                                val g = Group(
                                    title = "Gemeinsam: ${gift.title}", description = "Wir legen für „${gift.title}“ zusammen.",
                                    creatorName = ui.myName, creatorId = ui.me?.id, memberIds = listOfNotNull(ui.me?.id),
                                    isGiftGroup = true, giftId = gift.id,
                                )
                                vm.saveGroup(g)
                                navigate("group/${g.id}")
                            }) { Text("Gemeinsam schenken") }
                            if (ui.isCouple) TextButton(onClick = { edit = gift }) { Text("Bearbeiten") }
                        }
                    }
                }
            }
        }
        item {
            Text(
                "Tipp: Für größere Wünsche könnt ihr mit „Gemeinsam schenken“ eine Gruppe gründen, Beträge sammeln und euch absprechen.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp),
            )
        }
    }

    edit?.let { g ->
        val isNew = w.gifts.none { it.id == g.id }
        var title by remember(g) { mutableStateOf(g.title) }
        var desc by remember(g) { mutableStateOf(g.description) }
        var price by remember(g) { mutableStateOf(g.price) }
        var link by remember(g) { mutableStateOf(g.link) }
        FormDialog(if (isNew) "Wunsch hinzufügen" else "Wunsch bearbeiten", { edit = null }, saveEnabled = title.isNotBlank(), onSave = {
            vm.saveGift(g.copy(title = title, description = desc, price = price, link = link.trim())); edit = null
        }) {
            Field(title, { title = it }, "Geschenk", required = true)
            Field(desc, { desc = it }, "Beschreibung", singleLine = false, minLines = 2)
            Field(price, { price = it }, "Preis (ca.)")
            Field(link, { link = it }, "Link zum Händler", placeholder = "https://…")
            if (!isNew) TextButton(onClick = { vm.deleteGift(g.id); edit = null }) { Text("Wunsch löschen", color = MaterialTheme.colorScheme.error) }
        }
    }
}
