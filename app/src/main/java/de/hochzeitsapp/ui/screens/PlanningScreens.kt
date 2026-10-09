package de.hochzeitsapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.Tips
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*

/** Planung der Hochzeit (nur Brautpaar): Checklisten, Dienstleister, Ideen für Programmpunkte. */
@Composable
fun PlanningScreen(ui: UiState, vm: AppViewModel) {
    val w = ui.wedding ?: return
    val context = LocalContext.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var region by rememberSaveable { mutableStateOf(w.profile.bride.city.ifBlank { w.profile.groom.city }) }
    var addPhase by remember { mutableStateOf<String?>(null) }

    HeaderPage(ui, "Planung", "Checklisten, Dienstleister und Ideen für eure Hochzeit") {
        item {
            TabRow(tab, containerColor = MaterialTheme.colorScheme.background) {
                Tab(tab == 0, { tab = 0 }, text = { Text("Checkliste") })
                Tab(tab == 1, { tab = 1 }, text = { Text("Dienstleister") })
                Tab(tab == 2, { tab = 2 }, text = { Text("Ideen") })
            }
        }
        when (tab) {
            0 -> {
                val done = w.checklist.count { it.done }
                item {
                    Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                        Text("$done von ${w.checklist.size} erledigt", style = MaterialTheme.typography.titleSmall)
                        if (w.checklist.isNotEmpty()) LinearProgressIndicator(progress = { done.toFloat() / w.checklist.size }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                    }
                }
                w.checklist.groupBy { it.phase }.forEach { (phase, items) ->
                    item(key = "phase-$phase") {
                        SectionCard(title = phase, icon = Icons.Default.Checklist, action = {
                            IconButton(onClick = { addPhase = phase }) { Icon(Icons.Default.Add, "Punkt hinzufügen") }
                        }) {
                            items.forEach { c ->
                                Row(Modifier.fillMaxWidth().clickable { vm.toggleChecklist(c.id) }, verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(c.done, { vm.toggleChecklist(c.id) })
                                    Text(c.text, Modifier.weight(1f), textDecoration = if (c.done) TextDecoration.LineThrough else null, color = if (c.done) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface)
                                    IconButton(onClick = { vm.deleteChecklistItem(c.id) }, Modifier.size(32.dp)) { Icon(Icons.Default.Close, "Entfernen", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.outline) }
                                }
                            }
                        }
                    }
                }
            }
            1 -> {
                item {
                    OutlinedTextField(
                        region, { region = it }, label = { Text("Region") }, leadingIcon = { Icon(Icons.Default.LocationOn, null) },
                        singleLine = true, modifier = Modifier.fillMaxWidth().padding(16.dp),
                    )
                }
                Tips.vendorCategories.forEach { (label, query) ->
                    item(key = "v-$label") {
                        ListItem(
                            modifier = Modifier.clickable {
                                val uri = Uri.parse("geo:0,0?q=" + Uri.encode("$query $region".trim()))
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }.onFailure {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/" + Uri.encode("$query $region"))))
                                }
                            },
                            leadingContent = { Icon(Icons.Default.Storefront, null, tint = MaterialTheme.colorScheme.primary) },
                            headlineContent = { Text(label) },
                            supportingContent = { Text("In der Umgebung von ${region.ifBlank { "…" }} suchen") },
                            trailingContent = { Icon(Icons.AutoMirrored.Filled.OpenInNew, null) },
                            colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.background),
                        )
                    }
                }
            }
            else -> {
                Tips.programIdeas.forEach { t ->
                    item(key = "i-${t.title}") {
                        SectionCard(title = t.title, icon = Icons.Default.EmojiEvents) { Text(t.text, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
        }
    }

    addPhase?.let { phase ->
        var text by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { addPhase = null },
            title = { Text(phase) },
            text = { OutlinedTextField(text, { text = it }, label = { Text("Neuer Punkt") }, singleLine = true) },
            confirmButton = { TextButton(onClick = { if (text.isNotBlank()) vm.addChecklistItem(phase, text.trim()); addPhase = null }) { Text("Hinzufügen") } },
            dismissButton = { TextButton(onClick = { addPhase = null }) { Text("Abbrechen") } },
        )
    }
}

/** Tipps zur Durchführung – Linkliste nach Kategorien. */
@Composable
fun TipsScreen(ui: UiState) {
    val context = LocalContext.current
    HeaderPage(ui, "Tipps", "Wie funktioniert die App, und was gibt es zu beachten?") {
        Tips.guestTips.forEach { (cat, tips) ->
            item(key = cat) {
                SectionTitle(cat)
                tips.forEach { t ->
                    SectionCard(
                        Modifier.clickable(enabled = t.link != null) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(t.link))) },
                        title = t.title, icon = if (t.link != null) Icons.Default.Link else Icons.Default.Lightbulb,
                    ) { Text(t.text, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
        item(key = "ideas") {
            SectionTitle("Ideen für Programmpunkte")
            Tips.programIdeas.forEach { t -> SectionCard(title = t.title, icon = Icons.Default.EmojiEvents) { Text(t.text, style = MaterialTheme.typography.bodyMedium) } }
        }
    }
}

@Composable
fun SettingsScreen(ui: UiState, vm: AppViewModel, onLoggedOut: () -> Unit) {
    val w = ui.wedding ?: return
    var editCouple by remember { mutableStateOf(false) }
    var pwDialog by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    var switchDialog by remember { mutableStateOf(false) }

    HeaderPage(ui, "Einstellungen", "Angemeldet als ${ui.myName}${if (ui.isDemo) " (Demo)" else ""}") {
        if (ui.isCouple) {
            item {
                SectionCard(title = "Hochzeit", icon = Icons.Default.Favorite) {
                    ListItem(headlineContent = { Text("Braut & Bräutigam bearbeiten") }, leadingContent = { Icon(Icons.Default.People, null) }, modifier = Modifier.clickable { editCouple = true })
                    ListItem(headlineContent = { Text("Passwort ändern") }, leadingContent = { Icon(Icons.Default.Password, null) }, modifier = Modifier.clickable { pwDialog = true })
                    ListItem(
                        headlineContent = { Text("Gästefotos freigeben") },
                        supportingContent = { Text("Neue Fotos von Gästen erst nach eurer Freigabe zeigen") },
                        leadingContent = { Icon(Icons.Default.VerifiedUser, null) },
                        trailingContent = { Switch(w.profile.moderatePhotos, { on -> vm.updateProfile { it.copy(moderatePhotos = on) } }) },
                    )
                }
            }
        }
        if (ui.isDemo) {
            item {
                SectionCard(title = "Demo", icon = Icons.Default.PlayCircle) {
                    Text("Wechselt die Perspektive, um die App aus Sicht des Brautpaars oder eines Gastes zu erleben.", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { switchDialog = true }) { Text("Ansicht wechseln") }
                    TextButton(onClick = { vm.resetDemo() }) { Text("Demo-Daten zurücksetzen") }
                }
            }
        }
        item {
            SectionCard(title = "Konto", icon = Icons.Default.AccountCircle) {
                ListItem(headlineContent = { Text("Abmelden") }, leadingContent = { Icon(Icons.AutoMirrored.Filled.Logout, null) }, modifier = Modifier.clickable { vm.logout(); onLoggedOut() })
                if (ui.isCouple || ui.isDemo) ListItem(
                    headlineContent = { Text("Alle Daten auf diesem Gerät löschen", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.DeleteForever, null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { confirmReset = true },
                )
            }
        }
        item {
            Text(
                "Hinweis: Diese Version speichert alle Daten lokal auf dem Gerät. Für das gemeinsame Nutzen auf mehreren Handys ist ein Server-Backend vorgesehen.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp),
            )
        }
    }

    if (editCouple) {
        var bride by remember { mutableStateOf(w.profile.bride) }
        var groom by remember { mutableStateOf(w.profile.groom) }
        var tab by remember { mutableIntStateOf(0) }
        FormDialog("Braut & Bräutigam", { editCouple = false }, saveEnabled = bride.firstName.isNotBlank() && groom.firstName.isNotBlank(), onSave = {
            vm.updateProfile { it.copy(bride = bride, groom = groom) }; editCouple = false
        }) {
            TabRow(tab) {
                Tab(tab == 0, { tab = 0 }, text = { Text("Braut") })
                Tab(tab == 1, { tab = 1 }, text = { Text("Bräutigam") })
            }
            if (tab == 0) PersonForm(bride, true) { bride = it } else PersonForm(groom, true) { groom = it }
        }
    }
    if (pwDialog) {
        var pw by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { pwDialog = false },
            title = { Text("Neues Passwort") },
            text = { OutlinedTextField(pw, { pw = it }, label = { Text("mind. 4 Zeichen") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) },
            confirmButton = { TextButton(enabled = pw.length >= 4, onClick = { vm.changePassword(pw); pwDialog = false }) { Text("Speichern") } },
            dismissButton = { TextButton(onClick = { pwDialog = false }) { Text("Abbrechen") } },
        )
    }
    if (confirmReset) ConfirmDialog("Alle Daten löschen?", "Die Hochzeit mit allen Gästen, Fotos und Beiträgen wird von diesem Gerät gelöscht.", onConfirm = { vm.resetAll(); onLoggedOut() }, onDismiss = { confirmReset = false })
    if (switchDialog) {
        FormDialog("Ansicht wechseln", { switchDialog = false }, onSave = { switchDialog = false }) {
            ListItem(headlineContent = { Text("Brautpaar", fontWeight = FontWeight.SemiBold) }, leadingContent = { Icon(Icons.Default.Favorite, null) },
                modifier = Modifier.clickable { vm.switchSession(de.hochzeitsapp.data.Session.Couple); switchDialog = false })
            w.guests.forEach { g ->
                ListItem(headlineContent = { Text(g.fullName) }, supportingContent = { Text(g.role.label) }, leadingContent = { Avatar(g.fullName, g.photo, 36.dp) },
                    modifier = Modifier.clickable { vm.switchSession(de.hochzeitsapp.data.Session.AsGuest(g.id)); switchDialog = false })
            }
        }
    }
}
