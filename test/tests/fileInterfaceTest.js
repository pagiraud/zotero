describe("Zotero_File_Interface", function() {
    let win;
    before(function* () {
        win = yield loadZoteroPane();
        yield OS.File.copy(OS.Path.join(getTestDataDirectory().path, "Test Import Translator.js"),
                           OS.Path.join(Zotero.getTranslatorsDirectory().path, "Test Import Translator.js"));
        yield Zotero.Translators.reinit();
    });
    after(function () {
        win.close();
    });

    it('should import all types and fields into a new collection', async function () {
        this.timeout(10000);
        let testFile = getTestDataDirectory();
        testFile.append("allTypesAndFields.js");
        await win.Zotero_File_Interface.importFile({
        	file: testFile
        });

        let importedCollection = Zotero.Collections.getByLibrary(
			Zotero.Libraries.userLibraryID
		).filter(x => x.name == 'allTypesAndFields');
        assert.equal(importedCollection.length, 1);
        let childItems = importedCollection[0].getChildItems();
        let savedItems = {};
        for (let i=0; i<childItems.length; i++) {
            let savedItem = childItems[i].toJSON();
            delete savedItem.dateAdded;
            delete savedItem.dateModified;
            delete savedItem.key;
            delete savedItem.collections;
            savedItems[Zotero.ItemTypes.getName(childItems[i].itemTypeID)] = savedItem;
        }
        let trueItems = loadSampleData('itemJSON');
        for (let itemType in trueItems) {
            let trueItem = trueItems[itemType];
            delete trueItem.dateAdded;
            delete trueItem.dateModified;
            delete trueItem.key;
            delete trueItem.collections;
        }
        assert.deepEqual(savedItems, trueItems, "saved items match inputs");
    });
    
    
    it("should import RIS into selected collection", async function () {
    	var collection = await createDataObject('collection');
    	
        var testFile = OS.Path.join(getTestDataDirectory().path, 'book_and_child_note.ris');
        await win.Zotero_File_Interface.importFile({
        	file: testFile,
        	createNewCollection: false
        });
        
        var items = collection.getChildItems();
        assert.lengthOf(items, 1);
        var childNotes = items[0].getNotes();
        assert.lengthOf(childNotes, 1);
        assert.equal(Zotero.Items.get(childNotes[0]).getNote(), '<p>Child</p>');
    });
    
    
	it('should import an item and snapshot from Zotero RDF', function* () {
		var tmpDir = yield getTempDirectory();
		var rdfFile = OS.Path.join(tmpDir, 'test.rdf');
		yield OS.File.copy(OS.Path.join(getTestDataDirectory().path, 'book_and_snapshot.rdf'), rdfFile);
		yield OS.File.makeDir(OS.Path.join(tmpDir, 'files'));
		yield OS.File.makeDir(OS.Path.join(tmpDir, 'files', 2));
		yield OS.File.copy(
			OS.Path.join(getTestDataDirectory().path, 'test.html'),
			OS.Path.join(tmpDir, 'files', 2, 'test.html')
		);
		
		var promise = waitForItemEvent('add');
		yield win.Zotero_File_Interface.importFile({
			file: rdfFile
		});
		var ids = yield promise;
		// Notifications are batched
		assert.lengthOf(ids, 2);
		
		// Check book
		var item = Zotero.Items.get(ids[0]);
		assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('book'));
		
		// Check attachment
		var ids = item.getAttachments();
		assert.lengthOf(ids, 1);
		var attachment = Zotero.Items.get(ids[0]);
		assert.equal(attachment.attachmentCharset, 'utf-8');
		
		// Check indexing
		var matches = yield Zotero.Fulltext.findTextInItems([attachment.id], 'test');
		assert.lengthOf(matches, 1);
		assert.propertyVal(matches[0], 'id', attachment.id);
	});
	
	it('should import a MODS file', function* () {
		var modsFile = OS.Path.join(getTestDataDirectory().path, "mods.xml");
		
		var promise = waitForItemEvent('add');
		yield win.Zotero_File_Interface.importFile({
			file: modsFile
		});
		var ids = yield promise;
		assert.lengthOf(ids, 1);
		
		var item = Zotero.Items.get(ids[0]);
		assert.equal(item.itemTypeID, Zotero.ItemTypes.getID('journalArticle'));
		assert.equal(item.getField('title'), "Test");
	});
	
	describe("#copyItemsToClipboard()", function () {
		var clipboardService, item1, item2;
		
		before(function* () {
			yield Zotero.Styles.init();
			
			clipboardService = Components.classes["@mozilla.org/widget/clipboard;1"]
				.getService(Components.interfaces.nsIClipboard);
			
			item1 = createUnsavedDataObject('item', { title: "A" });
			item1.setField('date', '2016');
			yield item1.saveTx();
			item2 = createUnsavedDataObject('item', { title: "B" });
			item2.setField('date', '2016');
			yield item2.saveTx();
		});
		
		function getDataForFlavor(flavor) {
			var transferable = Components.classes["@mozilla.org/widget/transferable;1"]
				.createInstance(Components.interfaces.nsITransferable);
			transferable.init(null);
			transferable.addDataFlavor(flavor);
			clipboardService.getData(transferable, Components.interfaces.nsIClipboard.kGlobalClipboard);
			var str = {};
			transferable.getTransferData(flavor, str, {})
			return str.value.QueryInterface(Components.interfaces.nsISupportsString).data;
		}
		
		//
		// Non-"Copy as HTML" mode
		//
		it("should copy HTML and text citations to the clipboard", function* () {
			win.Zotero_File_Interface.copyItemsToClipboard(
				[item1, item2],
				'http://www.zotero.org/styles/apa',
				'en-US',
				false,
				true
			);
			
			// HTML
			var str = getDataForFlavor('text/html');
			assert.equal(str, '(<i>A</i>, 2016; <i>B</i>, 2016)');
			
			// Plain text
			str = getDataForFlavor('text/unicode');
			assert.equal(str, '(A, 2016; B, 2016)');
		});
		
		it("should copy HTML and text bibliography to the clipboard", function* () {
			win.Zotero_File_Interface.copyItemsToClipboard(
				[item1, item2],
				'http://www.zotero.org/styles/apa',
				'en-US'
			);
			
			var str = getDataForFlavor('text/html');
			assert.include(str, 'line-height');
			assert.include(str, '<i>A</i>');
			assert.include(str, '<i>B</i>');
			
			// Plain text
			str = getDataForFlavor('text/unicode');
			assert.equal(str, 'A. (2016).\nB. (2016).\n');
		});
		
		//
		// "Copy as HTML" mode
		//
		it("should copy HTML and HTML source citations to the clipboard", function* () {
			win.Zotero_File_Interface.copyItemsToClipboard(
				[item1, item2],
				'http://www.zotero.org/styles/apa',
				'en-US',
				true,
				true
			);
			
			var str = getDataForFlavor('text/html');
			assert.equal(str, '(<i>A</i>, 2016; <i>B</i>, 2016)');
			
			// Plain text
			str = getDataForFlavor('text/unicode');
			assert.equal(str, '(<i>A</i>, 2016; <i>B</i>, 2016)');
		});
		
		it("should copy HTML and HTML source bibliography to the clipboard", function* () {
			win.Zotero_File_Interface.copyItemsToClipboard(
				[item1, item2],
				'http://www.zotero.org/styles/apa',
				'en-US',
				true
			);
			
			var str = getDataForFlavor('text/html');
			assert.include(str, 'line-height');
			assert.include(str, '<i>A</i>');
			assert.include(str, '<i>B</i>');
			
			// Plain text
			str = getDataForFlavor('text/unicode');
			assert.include(str, 'line-height');
			assert.include(str, '<i>A</i>');
			assert.include(str, '<i>B</i>');
		});
	});

	describe('Citavi annotations', () => {
		it('should import Citavi', async () => {
			var testFile = OS.Path.join(getTestDataDirectory().path, 'citavi-test-project.ctv6');
			
			const promise = waitForItemEvent('add');
			await win.Zotero_File_Interface.importFile({
				file: testFile,
				createNewCollection: false
			});
			
			const itemIDs = await promise;
			const importedItem = await Zotero.Items.getAsync(itemIDs[0]);
			assert.equal(importedItem.getField('title'), 'Bitcoin: A Peer-to-Peer Electronic Cash System');
			const importedPDF = await Zotero.Items.getAsync(importedItem.getAttachments()[0]);
			const annotations = importedPDF.getAnnotations();
			assert.lengthOf(annotations, 4);
			const annotationTexts = importedPDF.getAnnotations().map(a => a.annotationText);
			const annotationPositions = importedPDF.getAnnotations().map(a => JSON.parse(a.annotationPosition));
			const annotationSortIndexes = importedPDF.getAnnotations().map(a => a.annotationSortIndex);
			const annotationTags = importedPDF.getAnnotations().map(a => a.getTags());
			
			assert.sameMembers(annotationTexts, [
				'peer-to-peer',
				'CPU power is controlled by nodes that are not cooperating to attack the network, they\'ll generate the longest chain and outpace attackers.',
				'double-spending',
				'This is a comment'
			]);
			assert.sameMembers(annotationSortIndexes, [
				'00000|000103|00206',
				'00000|000723|00309',
				'00000|000390|00252',
				'00000|000981|00355'
			]);

			assert.sameDeepMembers(annotationPositions, [
				{ pageIndex: 0, rects: [[230.202, 578.879, 275.478, 585.817], [230.202, 578.879, 275.478, 585.817]] },
				{ pageIndex: 0, rects: [[254.515, 532.841, 316.462, 539.679], [254.515, 532.841, 316.462, 539.679]] },
				{ pageIndex: 0, rects: [[228.335, 475.341, 461.756, 482.179], [146.3, 463.841, 437.511, 470.679], [146.3, 463.841, 461.756, 482.179]] },
				{ pageIndex: 0, rects: [[146.3, 429.341, 199.495, 436.179], [146.3, 429.341, 199.495, 436.179]] }
			]);

			assert.sameDeepMembers(annotationTags, [
				[{ tag: 'red' }], [], [{ tag: 'blue' }], [{ tag: 'comment' }]
			]);
		});
	});
});
