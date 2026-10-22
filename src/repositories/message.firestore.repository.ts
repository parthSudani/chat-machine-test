import {
  firestore,
  FieldValue,
  Timestamp,
  DocumentReference,
  Transaction,
} from '../config/firebase';

export interface FirestoreMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

export interface ReadReceiptDocument {
  userId: string;
  messageId: string;
  readAt: Timestamp;
}

export interface MemberLastSeenDocument {
  userId: string;
  lastSeenMessageId: string;
  lastSeenAt: Timestamp;
  lastSeenMessageCreatedAt: Timestamp;
}

export class MessageFirestoreRepository {
  /**
   * Reference to chats collection
   */
  private chatsCol = firestore.collection('chats');

  /**
   * Helper to get chat document reference
   */
  getChatRef(chatId: string): DocumentReference {
    return this.chatsCol.doc(chatId);
  }

  /**
   * Helper to get message document reference
   */
  getMessageRef(chatId: string, messageId: string): DocumentReference {
    return this.getChatRef(chatId).collection('messages').doc(messageId);
  }

  /**
   * Helper to get receipt document reference
   */
  getReceiptRef(
    chatId: string,
    messageId: string,
    userId: string
  ): DocumentReference {
    return this.getMessageRef(chatId, messageId).collection('receipts').doc(userId);
  }

  /**
   * Helper to get member last-seen document reference
   */
  getMemberRef(chatId: string, userId: string): DocumentReference {
    return this.getChatRef(chatId).collection('members').doc(userId);
  }

  /**
   * Helper to create a message in Firestore (useful for seeding, messaging, and tests)
   */
  async createMessage(
    chatId: string,
    senderId: string,
    text: string,
    customId?: string,
    customTimestamp?: Timestamp
  ): Promise<FirestoreMessage> {
    const msgRef = customId
      ? this.getMessageRef(chatId, customId)
      : this.getChatRef(chatId).collection('messages').doc();

    const createdAt = customTimestamp || (FieldValue.serverTimestamp() as unknown as Timestamp);

    const messageData = {
      id: msgRef.id,
      chatId,
      senderId,
      text,
      createdAt,
    };

    await msgRef.set(messageData);

    const snapshot = await msgRef.get();
    const data = snapshot.data();

    return {
      id: msgRef.id,
      chatId,
      senderId,
      text,
      createdAt: data?.createdAt as Timestamp,
    };
  }

  /**
   * Fetches a message by chatId and messageId
   */
  async getMessage(chatId: string, messageId: string): Promise<FirestoreMessage | null> {
    const doc = await this.getMessageRef(chatId, messageId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;
    if (data.chatId !== chatId) {
      return null;
    }
    return {
      id: doc.id,
      chatId: data.chatId as string,
      senderId: data.senderId as string,
      text: data.text as string,
      createdAt: data.createdAt as Timestamp,
    };
  }

  /**
   * Idempotently saves a read receipt preserving the original read timestamp
   */
  async recordReadReceiptIdempotent(
    chatId: string,
    messageId: string,
    userId: string
  ): Promise<{ receipt: ReadReceiptDocument; isNew: boolean }> {
    const receiptRef = this.getReceiptRef(chatId, messageId, userId);

    return firestore.runTransaction(async (tx: Transaction) => {
      const receiptDoc = await tx.get(receiptRef);

      if (receiptDoc.exists) {
        const data = receiptDoc.data()!;
        return {
          receipt: {
            userId: data.userId as string,
            messageId,
            readAt: data.readAt as Timestamp,
          },
          isNew: false,
        };
      }

      // First time reading: record server timestamp
      const newReadAt = Timestamp.now();
      tx.set(receiptRef, {
        userId,
        messageId,
        readAt: FieldValue.serverTimestamp(),
      });

      return {
        receipt: {
          userId,
          messageId,
          readAt: newReadAt,
        },
        isNew: true,
      };
    });
  }

  /**
   * Updates last-seen message pointer transactionally with strict monotonicity check
   */
  async updateLastSeenMonotonic(
    chatId: string,
    userId: string,
    targetMessage: FirestoreMessage
  ): Promise<{
    status: 'updated' | 'already_current' | 'ignored_older_than_current';
    lastSeenMessageId: string;
    lastSeenAt: Timestamp;
  }> {
    const memberRef = this.getMemberRef(chatId, userId);

    return firestore.runTransaction(async (tx: Transaction) => {
      const memberDoc = await tx.get(memberRef);
      const now = Timestamp.now();

      if (memberDoc.exists) {
        const currentData = memberDoc.data()!;
        const currentMessageId = currentData.lastSeenMessageId as string | undefined;
        const currentCreatedAt = currentData.lastSeenMessageCreatedAt as Timestamp | undefined;

        if (currentMessageId === targetMessage.id) {
          return {
            status: 'already_current',
            lastSeenMessageId: currentMessageId,
            lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
          };
        }

        if (currentCreatedAt) {
          const targetMillis = targetMessage.createdAt.toMillis();
          const currentMillis = currentCreatedAt.toMillis();

          // 1. If target message timestamp is older than current last-seen, ignore update
          if (targetMillis < currentMillis) {
            return {
              status: 'ignored_older_than_current',
              lastSeenMessageId: currentMessageId!,
              lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
            };
          }

          // 2. If timestamps are identical, break tie with deterministic document ID comparison
          if (targetMillis === currentMillis) {
            if (targetMessage.id <= currentMessageId!) {
              return {
                status: 'ignored_older_than_current',
                lastSeenMessageId: currentMessageId!,
                lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
              };
            }
          }
        }
      }

      // Advance last-seen pointer
      tx.set(
        memberRef,
        {
          userId,
          lastSeenMessageId: targetMessage.id,
          lastSeenAt: FieldValue.serverTimestamp(),
          lastSeenMessageCreatedAt: targetMessage.createdAt,
        },
        { merge: true }
      );

      return {
        status: 'updated',
        lastSeenMessageId: targetMessage.id,
        lastSeenAt: now,
      };
    });
  }

  /**
   * Fetches member last-seen document
   */
  async getMemberLastSeen(
    chatId: string,
    userId: string
  ): Promise<MemberLastSeenDocument | null> {
    const doc = await this.getMemberRef(chatId, userId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;
    return {
      userId: data.userId as string,
      lastSeenMessageId: data.lastSeenMessageId as string,
      lastSeenAt: data.lastSeenAt as Timestamp,
      lastSeenMessageCreatedAt: data.lastSeenMessageCreatedAt as Timestamp,
    };
  }
}

export const messageFirestoreRepository = new MessageFirestoreRepository();
